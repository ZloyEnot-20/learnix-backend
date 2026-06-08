import { ApiError } from "../utils/ApiError.js"

/** Restrict a route to one or more roles. */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized())
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You don't have access to this resource"))
    }
    next()
  }
}

/** Anyone who can access the admin panel / staff routes. */
export const isStaff = authorize("super_admin", "admin", "teacher")

/** Admin-level actions (super admin + admin), excludes teachers. */
export const isAdmin = authorize("super_admin", "admin")

/** Platform-level actions (content import, etc.). */
export const isSuperAdmin = authorize("super_admin")
