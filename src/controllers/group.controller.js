import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { addStudentToGroup, removeStudentFromGroup } from "../services/student.service.js"
import { serializeGroupDoc, serializeGroups, assertSelectableGroup, ENTRY_TEST_GROUP_NAME } from "../services/group.service.js"
import { recordAudit } from "../services/audit.service.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"

export const listGroups = asyncHandler(async (req, res) => {
  const groups = await Group.find(tenantFilter(req)).sort({ createdAt: -1 })
  res.json(await serializeGroups(groups))
})

export const getGroup = asyncHandler(async (req, res) => {
  const group = await assertTenantDoc(Group, req.params.id, req)
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
  const teacherId = req.user.type === "teacher" ? req.user.id : req.body.teacherId
  const { studentIds, ...body } = normalizeGroupLessonFields(req.body)
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
  await assertTenantDoc(Group, req.params.id, req)
  const { studentIds: _studentIds, ...patch } = normalizeGroupLessonFields(req.body)
  const group = await Group.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true, runValidators: true })

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
  await User.updateMany({ type: "student", groupId: group._id }, { $unset: { groupId: "" } })

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
  const student = await User.findOne({
    _id: req.body.studentId,
    type: "student",
    orgId: group.orgId,
  }).select("name")
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
