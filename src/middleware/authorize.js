import { ApiError } from "../utils/ApiError.js"
import { isAdminType, isStaffType, isSuperAdminType, USER_TYPES } from "../constants/userTypes.js"

/** Restrict a route to one or more user types. */
export function authorize(...types) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized())
    if (!types.includes(req.user.type)) {
      return next(ApiError.forbidden("You don't have access to this resource"))
    }
    next()
  }
}

/** Anyone who can access the admin panel / staff routes. */
export const isStaff = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!isStaffType(req.user.type)) {
    return next(ApiError.forbidden("You don't have access to this resource"))
  }
  next()
}

/** Admin-level actions (super admin + org admin), excludes teachers. */
export const isAdmin = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!isAdminType(req.user.type)) {
    return next(ApiError.forbidden("You don't have access to this resource"))
  }
  next()
}

/** Platform-level actions (content import, etc.). */
export const isSuperAdmin = (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!isSuperAdminType(req.user.type)) {
    return next(ApiError.forbidden("You don't have access to this resource"))
  }
  next()
}

export { USER_TYPES }
