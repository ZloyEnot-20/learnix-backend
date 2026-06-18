import { USER_TYPES } from "../constants/userTypes.js"
import { STAFF_PERMISSION_VALUES } from "../constants/staffPermissions.js"

export function normalizePermissions(list) {
  if (!Array.isArray(list)) return []
  const allowed = new Set(STAFF_PERMISSION_VALUES)
  return [...new Set(list.filter((p) => typeof p === "string" && allowed.has(p)))]
}

export function userPermissions(user) {
  return normalizePermissions(user?.permissions)
}

/** Admins and super admins implicitly have every permission. */
export function hasStaffPermission(req, permission) {
  if (!req.user) return false
  if (req.user.type === USER_TYPES.SUPER_ADMIN || req.user.type === USER_TYPES.ADMIN) {
    return true
  }
  if (req.user.type === USER_TYPES.TEACHER) {
    const perms = userPermissions(req.user)
    return perms.includes(permission)
  }
  return false
}
