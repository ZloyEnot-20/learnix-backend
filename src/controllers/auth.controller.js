import { User } from "../models/User.js"
import { hashPassword, verifyPassword } from "../utils/password.js"
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ensureLoginField } from "../services/student.service.js"
import { normalizeLogin } from "../utils/login.js"

function tokensFor(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  }
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body
  const normalized = email.toLowerCase()

  const existing = await User.findOne({ $or: [{ email: normalized }, { login: normalized }] })
  if (existing) throw ApiError.conflict("Email is already registered")

  const passwordHash = await hashPassword(password)
  const user = await User.create({
    login: normalized,
    email: normalized,
    name,
    role: "student",
    passwordHash,
  })

  res.status(201).json({ user: user.toSafeJSON(), ...tokensFor(user) })
})

export const login = asyncHandler(async (req, res) => {
  const { login, password } = req.body
  const identifier = normalizeLogin(login)

  const user = await User.findOne({
    $or: [{ login: identifier }, { email: identifier }],
  }).select("+passwordHash")

  const ok = user ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok) throw ApiError.unauthorized("Invalid login or password")

  if (!user.login && user.email) await ensureLoginField(user)

  res.json({ user: user.toSafeJSON(), ...tokensFor(user) })
})

export const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken
  if (!token) throw ApiError.unauthorized("Missing refresh token")

  let payload
  try {
    payload = verifyRefreshToken(token)
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token")
  }

  const user = await User.findById(payload.sub)
  if (!user) throw ApiError.unauthorized("Account no longer exists")

  res.json(tokensFor(user))
})

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) throw ApiError.unauthorized()
  res.json({ user: user.toSafeJSON() })
})
