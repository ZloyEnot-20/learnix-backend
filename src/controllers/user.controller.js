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
import { assertCanAddTeacher } from "../services/orgLimits.service.js"
import {
  manageableTypes,
  STAFF_TYPES,
  USER_TYPES,
  isAdminType,
} from "../constants/userTypes.js"
import { STAFF_PERMISSION_CATALOG } from "../constants/staffPermissions.js"
import { normalizePermissions } from "../services/permissions.service.js"

function assertCanManage(actor, target) {
  if (actor.id === target._id) {
    throw ApiError.badRequest("You cannot modify your own account here")
  }
  if (
    actor.type !== USER_TYPES.SUPER_ADMIN &&
    actor.orgId &&
    target.orgId &&
    actor.orgId !== target.orgId
  ) {
    throw ApiError.forbidden("You don't have access to this user")
  }
  if (target.type === USER_TYPES.SUPER_ADMIN && actor.type !== USER_TYPES.SUPER_ADMIN) {
    throw ApiError.forbidden("You don't have access to this user")
  }
  if (!manageableTypes(actor.type).includes(target.type)) {
    throw ApiError.forbidden("You don't have access to this user")
  }
}

function assertTypeAssignable(actorType, nextType) {
  if (!manageableTypes(actorType).includes(nextType)) {
    throw ApiError.forbidden(`You cannot assign the ${nextType} type`)
  }
}

async function clearTeacherFromGroups(teacherId) {
  await Group.updateMany({ teacherId }, { $unset: { teacherId: "" } })
}

async function findStaffById(id, req) {
  const filter = { _id: id, type: { $in: STAFF_TYPES }, ...tenantFilter(req) }
  const user = await User.findOne(filter)
  if (!user) return null
  if (!user.login && user.email) await ensureLoginField(user)
  return user
}

export const listUsers = asyncHandler(async (req, res) => {
  const types = manageableTypes(req.user.type)
  const users = await User.find({ type: { $in: types }, ...tenantFilter(req) }).sort({
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
  const { name, login, email, type } = req.body
  assertTypeAssignable(req.user.type, type)

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

  if (type === USER_TYPES.TEACHER) {
    await assertCanAddTeacher(orgId)
  }

  const plainPassword = generatePassword()
  const passwordHash = await hashPassword(plainPassword)

  const user = await User.create(
    withOrgId(req, {
      login: normalizedLogin,
      name: name.trim(),
      email: email?.trim().toLowerCase() || undefined,
      type,
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
    details: { type: user.type, login: user.login },
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
  if (patch.type !== undefined) {
    assertTypeAssignable(req.user.type, patch.type)
    if (patch.type === USER_TYPES.TEACHER && prev.type !== USER_TYPES.TEACHER) {
      await assertCanAddTeacher(prev.orgId)
    }
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

  const prevType = prev.type
  const user = await User.findByIdAndUpdate(prev._id, patch, { new: true })

  if (prevType === USER_TYPES.TEACHER && user.type !== USER_TYPES.TEACHER) {
    await clearTeacherFromGroups(user._id)
  }

  await recordAudit({
    req,
    action: "update",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
    details: { patch: req.body, previousType: prevType },
  })

  res.json(user.toSafeJSON())
})

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await findStaffById(req.params.id, req)
  if (!user) throw ApiError.notFound("User not found")
  assertCanManage(req.user, user)

  if (user.type === USER_TYPES.TEACHER) {
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
    details: { type: user.type, login: user.login },
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

function assertCanManagePermissions(actor, target) {
  if (!isAdminType(actor.type)) {
    throw ApiError.forbidden("Only admins can manage permissions")
  }
  if (actor.id === target._id) {
    throw ApiError.badRequest("You cannot change your own permissions")
  }
  if (target.type === USER_TYPES.SUPER_ADMIN) {
    throw ApiError.badRequest("Super admin permissions cannot be changed")
  }
  if (actor.type === USER_TYPES.ADMIN) {
    if (target.type !== USER_TYPES.TEACHER) {
      throw ApiError.forbidden("Organization admins can only manage teacher permissions")
    }
    if (actor.orgId && target.orgId && actor.orgId !== target.orgId) {
      throw ApiError.forbidden("You don't have access to this user")
    }
  }
}

export const listPermissionCatalog = asyncHandler(async (req, res) => {
  if (!isAdminType(req.user.type)) {
    throw ApiError.forbidden("Only admins can manage permissions")
  }
  res.json(STAFF_PERMISSION_CATALOG)
})

export const updateUserPermissions = asyncHandler(async (req, res) => {
  const target = await findStaffById(req.params.id, req)
  if (!target) throw ApiError.notFound("User not found")
  assertCanManagePermissions(req.user, target)

  const permissions = normalizePermissions(req.body.permissions)
  const user = await User.findByIdAndUpdate(target._id, { permissions }, { new: true })

  await recordAudit({
    req,
    action: "update_permissions",
    category: "users",
    targetType: "user",
    targetId: user._id,
    targetLabel: user.name,
    details: { permissions },
  })

  res.json(user.toSafeJSON())
})
