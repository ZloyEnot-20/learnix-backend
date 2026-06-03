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

export const isStaff = authorize("admin", "teacher")
