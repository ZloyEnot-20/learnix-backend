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

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized("Account no longer exists")

  req.user = {
    id: user._id,
    role: user.role,
    studentId: user.role === "student" ? user._id : undefined,
    name: user.name,
    email: user.email,
    login: user.login ?? user.email,
  }
  next()
})
