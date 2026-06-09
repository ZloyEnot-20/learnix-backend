import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { hashPassword } from "../utils/password.js"
import { ensureLoginField } from "../services/student.service.js"
import { generatePassword, normalizeLogin } from "../utils/login.js"
import { recordAudit } from "../services/audit.service.js"
import {
  resolveOrgId,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"

const STAFF_ROLES = ["super_admin", "admin", "teacher"]

function manageableRoles(actorRole) {
  if (actorRole === "super_admin") return STAFF_ROLES
  return ["admin", "teacher"]
}

function assertCanManage(actor, target) {
  if (actor.id === target._id) {
    throw ApiError.badRequest("You cannot modify your own account here")
  }
  if (
    actor.role !== "super_admin" &&
    actor.orgId &&
    target.orgId &&
    actor.orgId !== target.orgId
  ) {
    throw ApiError.forbidden("You don't have access to this user")
  }
  if (target.role === "super_admin" && actor.role !== "super_admin") {
    throw ApiError.forbidden("You don't have access to this user")
  }
  if (!manageableRoles(actor.role).includes(target.role)) {
    throw ApiError.forbidden("You don't have access to this user")
  }
}

function assertRoleAssignable(actorRole, nextRole) {
  if (!manageableRoles(actorRole).includes(nextRole)) {
    throw ApiError.forbidden(`You cannot assign the ${nextRole} role`)
  }
}

async function clearTeacherFromGroups(teacherId) {
  await Group.updateMany({ teacherId }, { $unset: { teacherId: "" } })
}

async function findStaffById(id, req) {
  const filter = { _id: id, role: { $in: STAFF_ROLES }, ...tenantFilter(req) }
  const user = await User.findOne(filter)
  if (!user) return null
  if (!user.login && user.email) await ensureLoginField(user)
  return user
}

export const listUsers = asyncHandler(async (req, res) => {
  const roles = manageableRoles(req.user.role)
  const users = await User.find({ role: { $in: roles }, ...tenantFilter(req) }).sort({
    createdAt: -1,
  })
  for (const u of users) {
    if (!u.login && u.email) await ensureLoginField(u)
  }
  res.json(users.map((u) => u.toSafeJSON()))
})

export const getUser = asyncHandler(async (req, res) => {
  const user = await findStaffById(req.params.id, req)
  if (!user) throw ApiError.notFound("User not found")
  assertCanManage(req.user, user)
  res.json(user.toSafeJSON())
})

export const createUser = asyncHandler(async (req, res) => {
  const { name, login, email, role } = req.body
  assertRoleAssignable(req.user.role, role)

  const normalizedLogin = normalizeLogin(login)
  if (!normalizedLogin) throw ApiError.badRequest("Login is required")

  const orgId = resolveOrgId(req)
  const taken = await User.findOne({
    orgId,
    $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
  })
  if (taken) throw ApiError.conflict("Login is already taken")

  if (email) {
    const normalizedEmail = email.toLowerCase()
    const emailTaken = await User.findOne({ orgId, email: normalizedEmail })
    if (emailTaken) throw ApiError.conflict("Email is already registered")
  }

  const plainPassword = generatePassword()
  const passwordHash = await hashPassword(plainPassword)

  const user = await User.create(
    withOrgId(req, {
      login: normalizedLogin,
      name: name.trim(),
      email: email?.trim().toLowerCase() || undefined,
      role,
      passwordHash,
    }),
  )

  await recordAudit({
    req,
    action: "create",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
    details: { role: user.role, login: user.login },
  })

  res.status(201).json({
    user: user.toSafeJSON(),
    temporaryPassword: plainPassword,
  })
})

export const updateUser = asyncHandler(async (req, res) => {
  const prev = await findStaffById(req.params.id, req)
  if (!prev) throw ApiError.notFound("User not found")
  assertCanManage(req.user, prev)

  const patch = { ...req.body }
  if (patch.role !== undefined) {
    assertRoleAssignable(req.user.role, patch.role)
  }

  if (patch.login !== undefined) {
    const normalizedLogin = normalizeLogin(patch.login)
    if (!normalizedLogin) throw ApiError.badRequest("Login is required")
    const taken = await User.findOne({
      _id: { $ne: prev._id },
      orgId: prev.orgId,
      $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
    })
    if (taken) throw ApiError.conflict("Login is already taken")
    patch.login = normalizedLogin
  }

  if (patch.email !== undefined) {
    const normalizedEmail = patch.email?.trim()?.toLowerCase()
    if (!normalizedEmail) {
      patch.email = undefined
    } else {
      const emailTaken = await User.findOne({
        _id: { $ne: prev._id },
        orgId: prev.orgId,
        email: normalizedEmail,
      })
      if (emailTaken) throw ApiError.conflict("Email is already registered")
      patch.email = normalizedEmail
    }
  }

  if (patch.name !== undefined) patch.name = patch.name.trim()

  const prevRole = prev.role
  const user = await User.findByIdAndUpdate(prev._id, patch, { new: true })

  if (prevRole === "teacher" && user.role !== "teacher") {
    await clearTeacherFromGroups(user._id)
  }

  await recordAudit({
    req,
    action: "update",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
    details: { patch: req.body, previousRole: prevRole },
  })

  res.json(user.toSafeJSON())
})

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await findStaffById(req.params.id, req)
  if (!user) throw ApiError.notFound("User not found")
  assertCanManage(req.user, user)

  if (user.role === "teacher") {
    await clearTeacherFromGroups(user._id)
  }

  await User.deleteOne({ _id: user._id })

  await recordAudit({
    req,
    action: "delete",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
    details: { role: user.role, login: user.login },
  })

  res.json({ ok: true })
})

export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await findStaffById(req.params.id, req)
  if (!user) throw ApiError.notFound("User not found")
  assertCanManage(req.user, user)

  const plainPassword = generatePassword()
  user.passwordHash = await hashPassword(plainPassword)
  await user.save()

  await recordAudit({
    req,
    action: "reset_password",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
  })

  res.json({ login: user.login, temporaryPassword: plainPassword })
})
