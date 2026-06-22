import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { addStudentToGroup, removeStudentFromGroup, isStudentActive } from "../services/student.service.js"
import {
  serializeGroupDoc,
  serializeGroups,
  assertSelectableGroup,
  ENTRY_TEST_GROUP_NAME,
  groupListFilter,
  assertTeacherGroupAccess,
  resolveGroupTeacherId,
  assertValidTeacherId,
} from "../services/group.service.js"
import { recordAudit } from "../services/audit.service.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  withOrgId,
} from "../services/tenantScope.service.js"
import { USER_TYPES } from "../constants/userTypes.js"
import { pruneOrphanedScheduledLessons } from "../services/lesson-schedule.service.js"

export const listGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find(groupListFilter(req)).sort({ createdAt: -1 })
  res.json(await serializeGroups(groups))
})

export const getGroup = asyncHandler(async (req, res) => {
  const group = await assertTenantDoc(Group, req.params.id, req)
  assertTeacherGroupAccess(req, group)
  res.json(await serializeGroupDoc(group))
})

function normalizeGroupLessonFields(body) {
  const next = { ...body }
  if (Array.isArray(next.lessonWeekdays)) {
    next.lessonWeekdays = [...new Set(next.lessonWeekdays.map(Number).filter((d) => d >= 0 && d <= 6))]
  }
  if (typeof next.lessonStartTime === "string") {
    next.lessonStartTime = next.lessonStartTime.trim().slice(0, 5)
  }
  if (typeof next.lessonEndTime === "string") {
    next.lessonEndTime = next.lessonEndTime.trim().slice(0, 5)
  }
  return next
}

export const createGroup = asyncHandler(async (req, res) => {
  if (req.body.name?.trim() === ENTRY_TEST_GROUP_NAME) {
    throw ApiError.badRequest("This group name is reserved for the entry test")
  }
  const teacherId = await resolveGroupTeacherId(req, req.body.teacherId)
  const { studentIds, teacherId: _teacherId, ...body } = normalizeGroupLessonFields(req.body)
  const group = await Group.create(
    withOrgId(req, {
      ...body,
      teacherId,
    }),
  )

  if (studentIds?.length) {
    for (const studentId of studentIds) {
      await addStudentToGroup(group._id, studentId)
    }
  }

  await recordAudit({
    req,
    action: "create",
    category: "groups",
    targetType: "group",
    targetId: group._id,
    targetLabel: group.name,
  })

  res.status(201).json(await serializeGroupDoc(group))
})

export const updateGroup = asyncHandler(async (req, res) => {
  const existing = await assertTenantDoc(Group, req.params.id, req)
  assertTeacherGroupAccess(req, existing)
  const { studentIds: _studentIds, ...patch } = normalizeGroupLessonFields(req.body)
  if (req.user.type === USER_TYPES.TEACHER) {
    delete patch.teacherId
  } else if (patch.teacherId !== undefined) {
    await assertValidTeacherId(req, patch.teacherId)
  }
  const group = await Group.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true })

  if (patch.monthlyFee !== undefined) {
    await User.updateMany(
      { type: "student", groupId: group._id },
      { $set: { monthlyFee: patch.monthlyFee } },
    )
  }

  if (patch.lessonWeekdays !== undefined) {
    await pruneOrphanedScheduledLessons(group)
  }

  await recordAudit({
    req,
    action: "update",
    category: "groups",
    targetType: "group",
    targetId: group._id,
    targetLabel: group.name,
    details: { patch },
  })

  res.json(await serializeGroupDoc(group))
})

export const deleteGroup = asyncHandler(async (req, res) => {
  const group = await assertTenantDoc(Group, req.params.id, req)
  assertSelectableGroup(group)
  await Group.findByIdAndDelete(group._id)
  await User.updateMany(
    { type: "student", groupId: group._id },
    { $unset: { groupId: "", groupJoinedAt: "", monthlyFee: "" } },
  )

  await recordAudit({
    req,
    action: "delete",
    category: "groups",
    targetType: "group",
    targetId: group._id,
    targetLabel: group.name,
  })

  res.json({ ok: true })
})

export const addMember = asyncHandler(async (req, res) => {
  const group = assertSelectableGroup(await assertOrgGroup(req.params.id, req))
  assertTeacherGroupAccess(req, group)
  const student = await User.findOne({
    _id: req.body.studentId,
    type: "student",
    orgId: group.orgId,
  }).select("name deletedAt")
  if (!student) throw ApiError.notFound("Student not found")
  if (!isStudentActive(student)) {
    throw ApiError.badRequest("Inactive students cannot be added to a group")
  }
  await addStudentToGroup(group._id, req.body.studentId)

  await recordAudit({
    req,
    action: "add_member",
    category: "groups",
    targetType: "group",
    targetId: group._id,
    targetLabel: group.name,
    details: {
      studentId: req.body.studentId,
      studentName: student?.name ?? null,
      groupId: group._id,
      groupName: group.name,
    },
  })

  res.json(await serializeGroupDoc(group))
})

export const removeMember = asyncHandler(async (req, res) => {
  const group = await assertOrgGroup(req.params.id, req)
  assertTeacherGroupAccess(req, group)
  const student = await User.findOne({
    _id: req.body.studentId,
    type: "student",
    orgId: group.orgId,
  }).select("name")
  await removeStudentFromGroup(group._id, req.body.studentId)

  await recordAudit({
    req,
    action: "remove_member",
    category: "groups",
    targetType: "group",
    targetId: group._id,
    targetLabel: group.name,
    details: {
      studentId: req.body.studentId,
      studentName: student?.name ?? null,
      groupId: group._id,
      groupName: group.name,
    },
  })

  res.json(await serializeGroupDoc(group))
})
