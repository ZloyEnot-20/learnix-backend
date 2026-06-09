import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { ApiError } from "../utils/ApiError.js"

/** Roles that may access data across all organizations. */
const CROSS_TENANT_ROLES = new Set(["super_admin"])

export function resolveOrgId(req) {
  return req.user?.orgId ?? null
}

export function canCrossTenant(req) {
  return CROSS_TENANT_ROLES.has(req.user?.role)
}

/** Mongo filter for tenant-scoped collections. Super admins see all when orgId is absent. */
export function tenantFilter(req) {
  const orgId = resolveOrgId(req)
  if (!orgId) {
    if (canCrossTenant(req)) return {}
    throw ApiError.forbidden("Organization context required")
  }
  return { orgId }
}

export function withOrgId(req, data = {}) {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")
  return { ...data, orgId }
}

export async function findOrgGroup(groupId, req) {
  if (!groupId) return null
  const orgId = resolveOrgId(req)
  if (!orgId || canCrossTenant(req)) return Group.findById(groupId)
  return Group.findOne({ _id: groupId, orgId })
}

export async function assertOrgGroup(groupId, req) {
  const group = await findOrgGroup(groupId, req)
  if (!group) throw ApiError.forbidden("Group not found in your organization")
  return group
}

export async function getOrgGroupIds(req) {
  const filter = tenantFilter(req)
  if (!filter.orgId && canCrossTenant(req)) {
    const groups = await Group.find().select("_id").lean()
    return groups.map((g) => g._id)
  }
  const groups = await Group.find(filter).select("_id").lean()
  return groups.map((g) => g._id)
}

export async function findTenantDoc(Model, id, req) {
  const orgId = resolveOrgId(req)
  if (!orgId || canCrossTenant(req)) return Model.findById(id)
  return Model.findOne({ _id: id, orgId })
}

export async function assertTenantDoc(Model, id, req) {
  const doc = await findTenantDoc(Model, id, req)
  if (!doc) throw ApiError.notFound("Not found")
  return doc
}

export async function assertStudentInOrg(studentId, req) {
  const orgId = resolveOrgId(req)
  if (!orgId || canCrossTenant(req)) {
    return User.findOne({ _id: studentId, role: "student" })
  }
  const student = await User.findOne({ _id: studentId, role: "student", orgId })
  if (!student) throw ApiError.forbidden("Student not found in your organization")
  return student
}

export function loginScopeFilter(orgId) {
  if (!orgId) return {}
  return { orgId }
}
