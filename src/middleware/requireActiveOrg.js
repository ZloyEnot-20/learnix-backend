import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { getOrgStatus } from "../services/orgStatus.service.js"

/** Rejects requests when the user's organization is blocked (super admins exempt). */
export const requireActiveOrg = asyncHandler(async (req, _res, next) => {
  const { orgId, type } = req.user ?? {}
  if (!orgId || type === "super_admin") return next()

  const status = await getOrgStatus(orgId)
  if (status === "blocked") {
    throw ApiError.forbidden("Organization is blocked")
  }
  next()
})
