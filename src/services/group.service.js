import { User } from "../models/User.js"

/** Student user ids belonging to a group (canonical source: User.groupId). */
export async function findStudentIdsInGroup(groupId, orgId = null) {
  if (!groupId) return []
  const filter = { type: "student", groupId }
  if (orgId) filter.orgId = orgId
  const users = await User.find(filter).select("_id")
  return users.map((u) => u._id)
}

/** Batch-load member ids for many groups in one query. */
export async function loadMemberIdsByGroupIds(groupIds, orgId = null) {
  const ids = [...new Set(groupIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const filter = { type: "student", groupId: { $in: ids } }
  if (orgId) filter.orgId = orgId
  const users = await User.find(filter).select("_id groupId")

  const map = new Map(ids.map((id) => [id, []]))
  for (const user of users) {
    map.get(user.groupId)?.push(user._id)
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

/** API shape: group fields + studentIds resolved from User.groupId. */
export function serializeGroup(group, studentIds = []) {
  return { ...groupToObject(group), studentIds }
}

export async function serializeGroupDoc(group) {
  if (!group) return null
  const studentIds = await findStudentIdsInGroup(group._id, group.orgId)
  return serializeGroup(group, studentIds)
}

export async function serializeGroups(groups) {
  if (groups.length === 0) return []
  const memberMap = await loadMemberIdsByGroupIds(groups.map((g) => g._id))
  return groups.map((g) => serializeGroup(g, memberMap.get(g._id) ?? []))
}
