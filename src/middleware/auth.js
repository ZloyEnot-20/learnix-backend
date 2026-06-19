import { verifyAccessToken } from "../utils/jwt.js"
import { User } from "../models/User.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/**
 * Authenticates the request using a Bearer access token.
 * Populates req.user with the (safe) user document.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? ""
  const token = header.startsWith("Bearer ") ? header.slice(7) : null
  if (!token) throw ApiError.unauthorized("Missing access token")

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    throw ApiError.unauthorized("Invalid or expired token")
  }

  if (payload.sub === "guest" || payload.type === "guest") {
    req.user = {
      id: "guest",
      type: "guest",
      orgId: null,
      name: "Guest",
      email: "",
      login: "guest",
      permissions: [],
      isGuest: true,
    }
    return next()
  }

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized("Account no longer exists")

  req.user = {
    id: user._id,
    type: user.type,
    orgId: user.orgId ?? null,
    name: user.name,
    email: user.email,
    login: user.login ?? user.email,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  }
  next()
})
