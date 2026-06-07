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
} from "../services/student.service.js"
import { suggestLogins, generatePassword, normalizeLogin } from "../utils/login.js"

export const listStudents = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "student" }).sort({ joinedAt: -1 })
  for (const u of users) {
    if (!u.login && u.email) await ensureLoginField(u)
  }
  res.json(users.map((u) => u.toStudentJSON()))
})

export const loginSuggestions = asyncHandler(async (req, res) => {
  const name = String(req.query.name ?? "").trim()
  if (!name) return res.json([])
  const suggestions = await suggestLogins(name)
  res.json(suggestions)
})

export const getStudent = asyncHandler(async (req, res) => {
  const student = await findStudentById(req.params.id)
  if (!student) throw ApiError.notFound("Student not found")
  if (req.user.role === "student" && req.user.id !== student._id) {
    throw ApiError.forbidden()
  }
  res.json(student.toStudentJSON())
})

export const createStudent = asyncHandler(async (req, res) => {
  const { name, login, email, phone, groupId, monthlyFee, notes } = req.body
  const normalizedLogin = normalizeLogin(login)
  if (!normalizedLogin) throw ApiError.badRequest("Login is required")

  const taken = await User.findOne({
    $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
  })
  if (taken) throw ApiError.conflict("Login is already taken")

  if (email) {
    const normalizedEmail = email.toLowerCase()
    const emailTaken = await User.findOne({ email: normalizedEmail })
    if (emailTaken) throw ApiError.conflict("Email is already registered")
  }

  const plainPassword = generatePassword()
  const passwordHash = await hashPassword(plainPassword)

  const user = await User.create({
    login: normalizedLogin,
    name: name.trim(),
    email: email?.trim().toLowerCase() || undefined,
    phone: phone?.trim() || undefined,
    role: "student",
    passwordHash,
    groupId: groupId || undefined,
    monthlyFee,
    notes: notes?.trim() || undefined,
  })

  if (groupId) await addStudentToGroup(groupId, user._id)

  res.status(201).json({
    student: user.toStudentJSON(),
    credentials: { login: user.login, password: plainPassword },
  })
})

export const updateStudent = asyncHandler(async (req, res) => {
  const prev = await findStudentById(req.params.id)
  if (!prev) throw ApiError.notFound("Student not found")

  const patch = { ...req.body }
  if (patch.login !== undefined) {
    const normalizedLogin = normalizeLogin(patch.login)
    if (!normalizedLogin) throw ApiError.badRequest("Login is required")
    const taken = await User.findOne({
      _id: { $ne: prev._id },
      $or: [{ login: normalizedLogin }, { email: normalizedLogin }],
    })
    if (taken) throw ApiError.conflict("Login is already taken")
    patch.login = normalizedLogin
  }
  if (patch.email !== undefined && patch.email) {
    const normalizedEmail = patch.email.toLowerCase()
    const emailTaken = await User.findOne({ _id: { $ne: prev._id }, email: normalizedEmail })
    if (emailTaken) throw ApiError.conflict("Email is already registered")
    patch.email = normalizedEmail
  }

  const nextGroup = patch.groupId
  const student = await User.findByIdAndUpdate(prev._id, patch, { new: true })

  if (nextGroup !== undefined && nextGroup !== prev.groupId) {
    if (prev.groupId) await removeStudentFromGroup(prev.groupId, student._id)
    if (nextGroup) await addStudentToGroup(nextGroup, student._id)
  }
  res.json(student.toStudentJSON())
})

export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await findStudentById(req.params.id)
  if (!student) throw ApiError.notFound("Student not found")
  if (student.groupId) await removeStudentFromGroup(student.groupId, student._id)
  await User.deleteOne({ _id: student._id })
  await Submission.deleteMany({ studentId: student._id })
  await Payment.deleteMany({ studentId: student._id })
  res.json({ ok: true })
})

/** Group + teacher names for the student's own profile (no group list access). */
export const getStudentContext = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.role === "student" && req.user.id !== studentId) {
    throw ApiError.forbidden()
  }

  const student = await findStudentById(studentId)
  if (!student) throw ApiError.notFound("Student not found")

  let groupName = null
  let teacherName = null
  if (student.groupId) {
    const group = await Group.findById(student.groupId)
    groupName = group?.name ?? null
    if (group?.teacherId) {
      const teacher = await User.findById(group.teacherId).select("name")
      teacherName = teacher?.name ?? null
    }
  }
  res.json({ groupName, teacherName })
})

/** Derived progress summary used by the student dashboard. */
export const getStudentProgress = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.role === "student" && req.user.id !== studentId) {
    throw ApiError.forbidden()
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
