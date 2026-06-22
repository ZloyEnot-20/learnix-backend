import { User } from "../models/User.js"
import { hashPassword, verifyPassword } from "../utils/password.js"
import {
  signAccessToken,
  signGuestAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js"
import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ensureLoginField } from "../services/student.service.js"
import { normalizeLogin } from "../utils/login.js"
import { recordAudit } from "../services/audit.service.js"
import { getOrgStatus } from "../services/orgStatus.service.js"
import { env, isProd } from "../config/env.js"

async function orgStatusFor(user) {
  if (!user.orgId || user.type === "super_admin") return null
  return getOrgStatus(user.orgId)
}

function tokensFor(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  }
}

export const register = asyncHandler(async (req, res) => {
  if (isProd && !env.allowPublicRegistration) {
    throw ApiError.forbidden("Public registration is disabled")
  }

  const { email, password, name } = req.body
  const normalized = email.toLowerCase()

  const existing = await User.findOne({ $or: [{ email: normalized }, { login: normalized }] })
  if (existing) throw ApiError.conflict("Email is already registered")

  const passwordHash = await hashPassword(password)
  const user = await User.create({
    login: normalized,
    email: normalized,
    name,
    type: "student",
    passwordHash,
  })

  const orgStatus = await orgStatusFor(user)
  res.status(201).json({ user: user.toSafeJSON(), orgStatus, ...tokensFor(user) })
})

export const login = asyncHandler(async (req, res) => {
  const { login, password, orgId } = req.body
  const identifier = normalizeLogin(login)

  const query = {
    $or: [{ login: identifier }, { email: identifier }],
  }
  if (orgId) query.orgId = orgId

  const user = await User.findOne(query).select("+passwordHash")

  const ok = user ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok) throw ApiError.unauthorized("Invalid login or password")
  if (user.deletedAt) throw ApiError.forbidden("This account has been deactivated")

  if (!user.login && user.email) await ensureLoginField(user)

  await recordAudit({
    req,
    actor: { id: user._id, name: user.name, type: user.type },
    action: "login",
    category: "auth",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
  })

  const orgStatus = await orgStatusFor(user)
  res.json({ user: user.toSafeJSON(), orgStatus, ...tokensFor(user) })
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
  if (user.deletedAt) throw ApiError.forbidden("This account has been deactivated")

  res.json(tokensFor(user))
})

export const me = asyncHandler(async (req, res) => {
  if (req.user?.type === "guest") {
    res.json({
      user: {
        id: "guest",
        orgId: null,
        login: "guest",
        email: "",
        name: "Guest",
        type: "guest",
        isPremium: false,
        avatarUrl: null,
        permissions: [],
      },
      orgStatus: null,
    })
    return
  }

  const user = await User.findById(req.user.id)
  if (!user) throw ApiError.unauthorized()
  if (user.deletedAt) throw ApiError.forbidden("This account has been deactivated")
  const orgStatus = await orgStatusFor(user)
  res.json({ user: user.toSafeJSON(), orgStatus })
})

export const guest = asyncHandler(async (_req, res) => {
  const accessToken = signGuestAccessToken()
  res.json({
    user: {
      id: "guest",
      orgId: null,
      login: "guest",
      email: "",
      name: "Guest",
      type: "guest",
      isPremium: false,
      avatarUrl: null,
      permissions: [],
    },
    orgStatus: null,
    accessToken,
  })
})
