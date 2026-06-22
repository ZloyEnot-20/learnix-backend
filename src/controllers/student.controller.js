import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { Submission } from "../models/Submission.js"
import { Payment } from "../models/Payment.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { hashPassword } from "../utils/password.js"
import {
  addStudentToGroup,
  removeStudentFromGroup,
  ensureLoginField,
  findStudentById,
  createStudentClaim,
  softDeleteStudent,
  isStudentActive,
} from "../services/student.service.js"
import { suggestLogins, generatePassword, normalizeLogin } from "../utils/login.js"
import { computeStudentLevel } from "../services/gamification.service.js"
import { buildIeltsProfile, buildIeltsSummaries } from "../services/ieltsProfile.service.js"
import { recordAudit } from "../services/audit.service.js"
import {
  assertOrgGroup,
  assertStudentInOrg,
  resolveOrgId,
  withOrgId,
} from "../services/tenantScope.service.js"
import { assertCanAddStudent } from "../services/orgLimits.service.js"
import { assertSelectableGroup, studentListFilter } from "../services/group.service.js"
import { notify } from "../services/notification.service.js"

export const listStudents = asyncHandler(async (req, res) => {
  const users = await User.find(await studentListFilter(req)).sort({ joinedAt: -1 })
  for (const u of users) {
    if (!u.login && u.email) await ensureLoginField(u)
  }
  res.json(users.map((u) => u.toStudentJSON()))
})

export const loginSuggestions = asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "").trim()
  if (!name) return res.json([])
  const suggestions = await suggestLogins(name, resolveOrgId(req))
  res.json(suggestions)
})

export const getStudent = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.params.id, req)
  if (!student) throw ApiError.notFound("Student not found")
  if (req.user.type === "student" && req.user.id !== student._id) {
    throw ApiError.forbidden()
  }
  res.json(student.toStudentJSON())
})

export const createStudent = asyncHandler(async (req, res) => {
  const { name, login, email, phone, groupId, notes } = req.body
  const normalizedLogin = normalizeLogin(login)
  if (!normalizedLogin) throw ApiError.badRequest("Login is required")

  const orgId = resolveOrgId(req)
  const taken = await User.findOne({
    orgId,
    $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
  })
  if (taken) throw ApiError.conflict(`Login "${normalizedLogin}" is already taken`)

  const normalizedEmail = email?.trim()?.toLowerCase()
  if (normalizedEmail) {
    const emailTaken = await User.findOne({ orgId, email: normalizedEmail })
    if (emailTaken) throw ApiError.conflict("Email is already registered")
  }

  if (groupId) assertSelectableGroup(await assertOrgGroup(groupId, req))

  await assertCanAddStudent(orgId)

  const plainPassword = generatePassword()
  const passwordHash = await hashPassword(plainPassword)

  const userPayload = withOrgId(req, {
    login: normalizedLogin,
    name: name.trim(),
    phone: phone?.trim() || undefined,
    type: "student",
    passwordHash,
    groupId: groupId || undefined,
    notes: notes?.trim() || undefined,
  })
  if (normalizedEmail) userPayload.email = normalizedEmail

  let user = await User.create(userPayload)

  if (groupId) {
    await addStudentToGroup(groupId, user._id)
    user = await User.findById(user._id)
  }

  let groupName = null
  if (groupId) {
    const g = await Group.findById(groupId).select("name")
    groupName = g?.name ?? null
  }

  // The password is delivered to the student via the Telegram bot once they
  // enter this one-time confirmation code, so it isn't surfaced to staff.
  const { code, expiresAt } = await createStudentClaim(user._id, plainPassword)

  await recordAudit({
    req,
    action: "create",
    category: "students",
    targetType: "student",
    targetId: user._id,
    targetLabel: user.name,
    details: { login: user.login, groupId: groupId ?? null, groupName },
  })

  res.status(201).json({
    student: user.toStudentJSON(),
    confirmation: { login: user.login, code, expiresAt },
  })
})

/** Staff: (re)generate a fresh confirmation code + password for a student. */
export const regenerateClaim = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.params.id, req)
  if (!student) throw ApiError.notFound("Student not found")

  const plainPassword = generatePassword()
  student.passwordHash = await hashPassword(plainPassword)
  await student.save()

  const { code, expiresAt } = await createStudentClaim(student._id, plainPassword)

  await recordAudit({
    req,
    action: "regenerate_claim",
    category: "students",
    targetType: "student",
    targetId: student._id,
    targetLabel: student.name,
  })

  res.json({ login: student.login, code, expiresAt })
})

export const updateStudent = asyncHandler(async (req, res) => {
  const prev = await assertStudentInOrg(req.params.id, req)
  if (!prev) throw ApiError.notFound("Student not found")

  const patch = { ...req.body }
  delete patch.monthlyFee
  const orgId = prev.orgId
  if (patch.login !== undefined) {
    const normalizedLogin = normalizeLogin(patch.login)
    if (!normalizedLogin) throw ApiError.badRequest("Login is required")
    const taken = await User.findOne({
      _id: { $ne: prev._id },
      orgId,
      $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
    })
    if (taken) throw ApiError.conflict(`Login "${normalizedLogin}" is already taken`)
    patch.login = normalizedLogin
  }
  if (patch.email !== undefined) {
    const normalizedEmail = patch.email?.trim()?.toLowerCase()
    if (!normalizedEmail) {
      delete patch.email
    } else {
      const emailTaken = await User.findOne({ _id: { $ne: prev._id }, orgId, email: normalizedEmail })
      if (emailTaken) throw ApiError.conflict("Email is already registered")
      patch.email = normalizedEmail
    }
  }

  if (patch.groupId) assertSelectableGroup(await assertOrgGroup(patch.groupId, req))

  const unset = {}
  if (patch.targetBand === null) {
    unset.targetBand = 1
    delete patch.targetBand
  }
  if (patch.targetExamDate === null) {
    unset.targetExamDate = 1
    delete patch.targetExamDate
  }

  const nextGroup = patch.groupId
  const shouldUnsetEmail =
    patch.email === undefined && Object.prototype.hasOwnProperty.call(req.body, "email")

  let student = shouldUnsetEmail
    ? await User.findByIdAndUpdate(
        prev._id,
        Object.keys(unset).length
          ? { $set: patch, $unset: { ...unset, email: 1 } }
          : { $set: patch, $unset: { email: 1 } },
        { new: true },
      )
    : Object.keys(unset).length
      ? await User.findByIdAndUpdate(prev._id, { $set: patch, $unset: unset }, { new: true })
      : await User.findByIdAndUpdate(prev._id, patch, { new: true })

  if (nextGroup !== undefined && nextGroup !== prev.groupId) {
    if (prev.groupId) await removeStudentFromGroup(prev.groupId, student._id)
    if (nextGroup) await addStudentToGroup(nextGroup, student._id)
    student = await User.findById(student._id)
  }

  const auditDetails = {}
  if (nextGroup !== undefined && nextGroup !== prev.groupId) {
    const [fromGroup, toGroup] = await Promise.all([
      prev.groupId ? Group.findById(prev.groupId).select("name") : null,
      nextGroup ? Group.findById(nextGroup).select("name") : null,
    ])
    auditDetails.groupChange = {
      fromGroupId: prev.groupId ?? null,
      fromGroupName: fromGroup?.name ?? null,
      toGroupId: nextGroup ?? null,
      toGroupName: toGroup?.name ?? null,
    }
  }

  await recordAudit({
    req,
    action: "update",
    category: "students",
    targetType: "student",
    targetId: student._id,
    targetLabel: student.name,
    details: Object.keys(auditDetails).length ? auditDetails : null,
  })

  if (auditDetails.groupChange) {
    const fromName = auditDetails.groupChange.fromGroupName ?? "No group"
    const toName = auditDetails.groupChange.toGroupName ?? "No group"
    await notify(student._id, {
      type: "system",
      title: "Group update",
      message: `You have been moved from ${fromName} to ${toName}.`,
      data: {
        kind: "group_change",
        fromGroupId: auditDetails.groupChange.fromGroupId,
        toGroupId: auditDetails.groupChange.toGroupId,
      },
    })
  }

  res.json(student.toStudentJSON())
})

/** Staff: send a custom in-app notification to a student. */
export const sendStudentNotification = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.params.id, req)
  if (!student) throw ApiError.notFound("Student not found")

  const { title, message, type } = req.body
  const note = await notify(student._id, {
    type: type ?? "system",
    title: title.trim(),
    message: message.trim(),
    data: { sentBy: req.user.id, sentByName: req.user.name },
  })

  await recordAudit({
    req,
    action: "notify",
    category: "students",
    targetType: "student",
    targetId: student._id,
    targetLabel: student.name,
    details: { title: note.title },
  })

  res.status(201).json({
    id: note._id,
    studentId: note.studentId,
    type: note.type,
    title: note.title,
    message: note.message,
    read: note.read,
    createdAt: note.createdAt,
  })
})

export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.params.id, req)
  if (!student) throw ApiError.notFound("Student not found")
  let groupName = null
  if (student.groupId) {
    const g = await Group.findById(student.groupId).select("name")
    groupName = g?.name ?? null
  }
  if (student.groupId) await removeStudentFromGroup(student.groupId, student._id)
  await User.deleteOne({ _id: student._id })
  await Submission.deleteMany({ studentId: student._id })
  await Payment.deleteMany({ studentId: student._id })

  await recordAudit({
    req,
    action: "delete",
    category: "students",
    targetType: "student",
    targetId: student._id,
    targetLabel: student.name,
    details: groupName ? { groupName } : null,
  })

  res.json({ ok: true })
})

/** Student: soft-delete own account (sets deletedAt, marks inactive). */
export const deleteMyAccount = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.type !== "student" || req.user.id !== studentId) {
    throw ApiError.forbidden()
  }

  const student = await findStudentById(studentId)
  if (!student) throw ApiError.notFound("Student not found")
  if (!isStudentActive(student)) {
    throw ApiError.badRequest("Account is already deactivated")
  }

  let groupName = null
  if (student.groupId) {
    const g = await Group.findById(student.groupId).select("name")
    groupName = g?.name ?? null
  }

  await softDeleteStudent(student)

  await recordAudit({
    req,
    action: "self_delete",
    category: "students",
    targetType: "student",
    targetId: student._id,
    targetLabel: student.name,
    details: groupName ? { groupName } : null,
  })

  res.json({ ok: true, deletedAt: student.deletedAt })
})

/** Group + teacher names for the student's own profile (no group list access). */
export const getStudentContext = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.type === "student" && req.user.id !== studentId) {
    throw ApiError.forbidden()
  }
  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }

  const student = await findStudentById(studentId)
  if (!student) throw ApiError.notFound("Student not found")

  let groupName = null
  let teacherName = null
  let lessonSchedule = null
  if (student.groupId) {
    const group = await Group.findById(student.groupId)
    groupName = group?.name ?? null
    if (group?.teacherId) {
      const teacher = await User.findById(group.teacherId).select("name")
      teacherName = teacher?.name ?? null
    }
    if (
      group?.lessonWeekdays?.length &&
      group.lessonStartTime &&
      group.lessonEndTime
    ) {
      const startTime = String(group.lessonStartTime).trim().slice(0, 5)
      const endTime = String(group.lessonEndTime).trim().slice(0, 5)
      lessonSchedule = {
        weekdays: group.lessonWeekdays,
        startTime,
        endTime,
      }
    }
  }
  res.json({ groupName, teacherName, lessonSchedule })
})

/** Gamification level/points summary for a student. */
export const getStudentLevel = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.type === "student" && req.user.id !== studentId) {
    throw ApiError.forbidden()
  }
  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }
  const summary = await computeStudentLevel(studentId)
  res.json(summary)
})

/** Derived progress summary used by the student dashboard. */
export const getStudentProgress = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.type === "student" && req.user.id !== studentId) {
    throw ApiError.forbidden()
  }
  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }

  const [subs, payments] = await Promise.all([
    Submission.find({ studentId }),
    Payment.find({ studentId }),
  ])

  const completed = subs.filter((s) => s.status === "graded" || s.status === "submitted")
  const scored = subs.filter((s) => typeof s.score === "number")
  const averageScore = scored.length
    ? scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length
    : null

  const unpaid = payments.filter((p) => p.status !== "paid")
  const upcomingPayment = [...unpaid].sort(
    (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
  )[0]
  const unpaidTotal = unpaid.reduce((a, b) => a + b.amount, 0)
  const paidTotal = payments
    .filter((p) => p.status === "paid")
    .reduce((a, b) => a + b.amount, 0)

  res.json({
    totalHomework: subs.length,
    completedHomework: completed.length,
    pendingHomework: subs.length - completed.length,
    averageScore,
    upcomingPayment: upcomingPayment ?? null,
    unpaidTotal,
    paidTotal,
  })
})

/** Full IELTS profile for teacher student card. */
export const getIeltsProfile = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.params.id, req)
  if (!student) throw ApiError.notFound("Student not found")
  if (req.user.type === "student" && req.user.id !== student._id) {
    throw ApiError.forbidden()
  }
  const profile = await buildIeltsProfile(student)
  res.json(profile)
})

/** Compact IELTS summaries for all students (staff list view). */
export const getIeltsSummaries = asyncHandler(async (req, res) => {
  const users = await User.find(await studentListFilter(req)).lean()
  const summaries = await buildIeltsSummaries(users)
  res.json(summaries)
})
