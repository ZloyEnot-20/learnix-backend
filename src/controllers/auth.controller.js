import { User } from "../models/User.js"
import { Student } from "../models/Student.js"
import { hashPassword, verifyPassword } from "../utils/password.js"
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ensureStudentAccount } from "../services/student.service.js"

function tokensFor(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  }
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body
  const normalized = email.toLowerCase()

  const existing = await User.findOne({ email: normalized })
  if (existing) throw ApiError.conflict("Email is already registered")

  const passwordHash = await hashPassword(password)
  const user = await User.create({
    email: normalized,
    name,
    role: "student",
    passwordHash,
  })

  // New self-registered users are students: create their CRM record + group.
  const student = await ensureStudentAccount({
    id: user._id,
    name: user.name,
    email: user.email,
  })
  user.studentId = student._id
  await user.save()

  res.status(201).json({ user: user.toSafeJSON(), ...tokensFor(user) })
})

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body
  const normalized = email.toLowerCase()

  const user = await User.findOne({ email: normalized }).select("+passwordHash")
  // Always run a verification to reduce user-enumeration timing differences.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok) throw ApiError.unauthorized("Invalid email or password")

  if (user.role === "student" && !user.studentId) {
    const student = await ensureStudentAccount({
      id: user._id,
      name: user.name,
      email: user.email,
    })
    user.studentId = student._id
    await user.save()
  }

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
