import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { ApiError } from "../utils/ApiError.js"
import { USER_TYPES } from "../constants/userTypes.js"
import { tenantFilter } from "./tenantScope.service.js"
import { hasStaffPermission } from "./permissions.service.js"
import { STAFF_PERMISSIONS } from "../constants/staffPermissions.js"

/** System-managed group for entry test candidates — not assignable manually. */
export const ENTRY_TEST_GROUP_NAME = "ENTRY TEST"

export function isEntryTestGroup(group) {
  return group?.name === ENTRY_TEST_GROUP_NAME
}

export function assertSelectableGroup(group) {
  if (isEntryTestGroup(group)) {
    throw ApiError.badRequest("The Entry Test group cannot be used for this action")
  }
  return group
}

/** List filter: teachers only see groups assigned to them (unless granted view_all). */
export function groupListFilter(req) {
  const filter = tenantFilter(req)
  if (
    req.user?.type === USER_TYPES.TEACHER &&
    !hasStaffPermission(req, STAFF_PERMISSIONS.GROUPS_VIEW_ALL)
  ) {
    return { ...filter, teacherId: req.user.id }
  }
  return filter
}

function teacherOwnGroupFilter(req) {
  return { ...tenantFilter(req), teacherId: req.user.id }
}

/** Group ids assigned to the current teacher. */
export async function teacherOwnGroupIds(req) {
  if (req.user?.type !== USER_TYPES.TEACHER) return []
  const groups = await Group.find(teacherOwnGroupFilter(req)).select("_id").lean()
  return groups.map((g) => String(g._id))
}

/**
 * Group ids for filtering a resource list.
 * Returns null when the caller may see all org groups (admin or permission granted).
 */
export async function resourceGroupIds(req, viewAllPermission) {
  if (req.user?.type !== USER_TYPES.TEACHER) return null
  if (hasStaffPermission(req, viewAllPermission)) return null
  const ids = await teacherOwnGroupIds(req)
  return ids.length ? ids : []
}

/** @deprecated Use resourceGroupIds with the relevant permission. */
export async function teacherGroupIds(req) {
  return resourceGroupIds(req, STAFF_PERMISSIONS.GROUPS_VIEW_ALL)
}

/** Mongo filter for student lists: teachers only see students in their groups. */
export async function studentListFilter(req) {
  const filter = { type: "student", ...tenantFilter(req) }
  if (req.user?.type === USER_TYPES.TEACHER) {
    if (hasStaffPermission(req, STAFF_PERMISSIONS.STUDENTS_VIEW_ALL)) return filter
    const groupIds = await teacherOwnGroupIds(req)
    filter.groupId = { $in: groupIds }
  }
  return filter
}

export async function assertTeacherStudentAccess(req, student) {
  if (req.user?.type !== USER_TYPES.TEACHER) return
  if (hasStaffPermission(req, STAFF_PERMISSIONS.STUDENTS_VIEW_ALL)) return
  if (!student?.groupId) {
    throw ApiError.forbidden("You don't have access to this student")
  }
  const group = await Group.findById(student.groupId)
  assertTeacherGroupAccess(req, group)
}

export function assertTeacherGroupAccess(req, group) {
  if (req.user?.type !== USER_TYPES.TEACHER) return
  if (hasStaffPermission(req, STAFF_PERMISSIONS.GROUPS_VIEW_ALL)) return
  if (group.teacherId !== req.user.id) {
    throw ApiError.forbidden("You don't have access to this group")
  }
}

export async function resolveGroupTeacherId(req, bodyTeacherId) {
  if (req.user.type === USER_TYPES.TEACHER) {
    return req.user.id
  }
  if (!bodyTeacherId || typeof bodyTeacherId !== "string") {
    throw ApiError.badRequest("teacherId is required")
  }
  const teacher = await User.findOne({
    _id: bodyTeacherId,
    type: USER_TYPES.TEACHER,
    ...tenantFilter(req),
  })
  if (!teacher) {
    throw ApiError.badRequest("Teacher not found in your organization")
  }
  return bodyTeacherId
}

export async function assertValidTeacherId(req, teacherId) {
  if (!teacherId || typeof teacherId !== "string") {
    throw ApiError.badRequest("teacherId is required")
  }
  const teacher = await User.findOne({
    _id: teacherId,
    type: USER_TYPES.TEACHER,
    ...tenantFilter(req),
  })
  if (!teacher) {
    throw ApiError.badRequest("Teacher not found in your organization")
  }
}

/** Student user ids belonging to a group (canonical source: User.groupId). */
export async function findStudentIdsInGroup(groupId, orgId = null) {
  if (!groupId) return []
  const gid = String(groupId)
  const filter = { type: "student", groupId: gid }
  if (orgId) filter.orgId = orgId
  const users = await User.find(filter).select("_id")
  return users.map((u) => u._id)
}

/** Batch-load member ids for many groups in one query. */
export async function loadMemberIdsByGroupIds(groupIds, orgId = null) {
  const ids = [...new Set(groupIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const normalizedIds = ids.map((id) => String(id))
  const filter = { type: "student", groupId: { $in: normalizedIds } }
  if (orgId) filter.orgId = orgId
  const users = await User.find(filter).select("_id groupId")

  const map = new Map(normalizedIds.map((id) => [id, []]))
  for (const user of users) {
    map.get(String(user.groupId))?.push(user._id)
  }
  return map
}

function groupToObject(group) {
  const o = group.toObject?.() ?? { ...group }
  o.id = o._id
  delete o._id
  delete o.__v
  return o
}

/** Batch-load teacher display names for group serialization. */
async function loadTeacherNamesById(teacherIds) {
  const ids = [...new Set(teacherIds.filter(Boolean).map(String))]
  if (ids.length === 0) return new Map()

  const teachers = await User.find({
    _id: { $in: ids },
    type: USER_TYPES.TEACHER,
  }).select("_id name")

  return new Map(teachers.map((teacher) => [String(teacher._id), teacher.name]))
}

/** API shape: group fields + studentIds resolved from User.groupId. */
export function serializeGroup(group, studentIds = [], teacherName = null) {
  return { ...groupToObject(group), studentIds, teacherName }
}

export async function serializeGroupDoc(group) {
  if (!group) return null
  const studentIds = await findStudentIdsInGroup(group._id, group.orgId)
  let teacherName = null
  if (group.teacherId) {
    const teacher = await User.findById(group.teacherId).select("name")
    teacherName = teacher?.name ?? null
  }
  return serializeGroup(group, studentIds, teacherName)
}

export async function serializeGroups(groups) {
  if (groups.length === 0) return []
  const memberMap = await loadMemberIdsByGroupIds(groups.map((g) => g._id))
  const teacherNameMap = await loadTeacherNamesById(groups.map((g) => g.teacherId))
  return groups.map((g) =>
    serializeGroup(
      g,
      memberMap.get(g._id) ?? [],
      g.teacherId ? teacherNameMap.get(String(g.teacherId)) ?? null : null,
    ),
  )
}
