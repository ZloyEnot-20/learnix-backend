import { Student } from "../models/Student.js"
import { Submission } from "../models/Submission.js"
import { Payment } from "../models/Payment.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { addStudentToGroup, removeStudentFromGroup } from "../services/student.service.js"

export const listStudents = asyncHandler(async (_req, res) => {
  const students = await Student.find().sort({ joinedAt: -1 })
  res.json(students)
})

export const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
  if (!student) throw ApiError.notFound("Student not found")
  // Students may only read their own record.
  if (req.user.role === "student" && req.user.studentId !== student._id) {
    throw ApiError.forbidden()
  }
  res.json(student)
})

export const createStudent = asyncHandler(async (req, res) => {
  const student = await Student.create(req.body)
  if (student.groupId) await addStudentToGroup(student.groupId, student._id)
  res.status(201).json(student)
})

export const updateStudent = asyncHandler(async (req, res) => {
  const prev = await Student.findById(req.params.id)
  if (!prev) throw ApiError.notFound("Student not found")

  const nextGroup = req.body.groupId
  const student = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true })

  if (nextGroup !== undefined && nextGroup !== prev.groupId) {
    if (prev.groupId) await removeStudentFromGroup(prev.groupId, student._id)
    if (nextGroup) await addStudentToGroup(nextGroup, student._id)
  }
  res.json(student)
})

export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
  if (!student) throw ApiError.notFound("Student not found")
  if (student.groupId) await removeStudentFromGroup(student.groupId, student._id)
  await Student.deleteOne({ _id: student._id })
  await Submission.deleteMany({ studentId: student._id })
  await Payment.deleteMany({ studentId: student._id })
  res.json({ ok: true })
})

/** Derived progress summary used by the student dashboard. */
export const getStudentProgress = asyncHandler(async (req, res) => {
  const studentId = req.params.id
  if (req.user.role === "student" && req.user.studentId !== studentId) {
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
