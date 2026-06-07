import { EntryTest } from "../models/EntryTest.js"
import { findStudentById } from "../services/student.service.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recomputeStatus } from "../services/entryTest.service.js"
import { notify } from "../services/notification.service.js"
import {
  mcLevel,
  readingLevel,
  scoreMc,
  scoreReading,
} from "../content/entry-test.js"

/** Convert a Map-bearing doc to a plain object for the client. */
function serialize(doc) {
  const o = doc.toObject({ flattenMaps: true })
  o.id = o._id
  delete o._id
  delete o.__v
  return o
}

/** Ensure the caller can act on this entry test (owner student or staff). */
function assertAccess(req, doc) {
  // Any staff role (super admin / admin / teacher) has full access.
  if (req.user.role !== "student") return
  const myStudentId = req.user.studentId ?? req.user.id
  if (doc.studentId !== myStudentId) throw ApiError.forbidden()
}

export const listEntryTests = asyncHandler(async (_req, res) => {
  const tests = await EntryTest.find().sort({ assignedAt: -1 })
  res.json(tests.map(serialize))
})

export const getEntryTest = asyncHandler(async (req, res) => {
  const doc = await EntryTest.findById(req.params.id)
  if (!doc) throw ApiError.notFound("Entry test not found")
  assertAccess(req, doc)
  res.json(serialize(doc))
})

/** The active entry test for the authenticated student (or by id for staff). */
export const myEntryTest = asyncHandler(async (req, res) => {
  const studentId = req.user.studentId ?? req.user.id
  const doc = await EntryTest.findOne({ studentId }).sort({ assignedAt: -1 })
  res.json(doc ? serialize(doc) : null)
})

export const assignEntryTest = asyncHandler(async (req, res) => {
  const student = await findStudentById(req.body.studentId)
  if (!student) throw ApiError.notFound("Student not found")

  const active = await EntryTest.findOne({
    studentId: student._id,
    status: { $ne: "graded" },
  })
  if (active) throw ApiError.conflict("Student already has an active entry test")

  const doc = await EntryTest.create({
    studentId: student._id,
    studentName: student.name,
    studentEmail: student.email ?? "",
    assignedBy: req.user.name,
  })
  await notify(student._id, {
    type: "entry_test",
    title: "Entry / placement test assigned",
    message: "Your tutor assigned a placement test. Open it from your dashboard.",
  }).catch(() => {})
  res.status(201).json(serialize(doc))
})

export const deleteEntryTest = asyncHandler(async (req, res) => {
  const doc = await EntryTest.findByIdAndDelete(req.params.id)
  if (!doc) throw ApiError.notFound("Entry test not found")
  res.json({ ok: true })
})

async function loadOwned(req) {
  const doc = await EntryTest.findById(req.params.id)
  if (!doc) throw ApiError.notFound("Entry test not found")
  assertAccess(req, doc)
  return doc
}

export const saveMc = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.mcAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreMc(req.body.answers)
    doc.mcCompleted = true
    doc.mcScore = score
    doc.mcLevel = mcLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await doc.save()
  res.json(serialize(doc))
})

export const saveReading = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.readingAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreReading(req.body.answers)
    doc.readingCompleted = true
    doc.readingScore = score
    doc.readingLevel = readingLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await doc.save()
  res.json(serialize(doc))
})

export const saveWritingDraft = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.writingText = req.body.text
  doc.status = recomputeStatus(doc)
  await doc.save()
  res.json(serialize(doc))
})

export const submitWriting = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  const text = req.body.text
  doc.writingText = text
  doc.writingSubmitted = true
  doc.writingWordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  doc.status = recomputeStatus(doc)
  await doc.save()
  res.json(serialize(doc))
})

/** Staff-only: grade the writing + set the overall placement level. */
export const gradeWriting = asyncHandler(async (req, res) => {
  const doc = await EntryTest.findById(req.params.id)
  if (!doc) throw ApiError.notFound("Entry test not found")
  doc.writingLevel = req.body.writingLevel
  doc.overallLevel = req.body.overallLevel
  doc.writingFeedback = req.body.feedback?.trim() || undefined
  doc.status = recomputeStatus(doc)
  await doc.save()
  await notify(doc.studentId, {
    type: "result",
    title: "Your level has been assessed",
    message: `Your tutor set your overall level to ${doc.overallLevel}. View your results.`,
  }).catch(() => {})
  res.json(serialize(doc))
})
