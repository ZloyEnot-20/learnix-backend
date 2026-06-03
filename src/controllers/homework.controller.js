import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Group } from "../models/Group.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

function bandFromAttempt(total, correct) {
  if (!total || total <= 0) return undefined
  return Math.round((correct / total) * 9 * 2) / 2
}

export const listHomework = asyncHandler(async (_req, res) => {
  const homework = await Homework.find().sort({ createdAt: -1 })
  res.json(homework)
})

export const getHomework = asyncHandler(async (req, res) => {
  const hw = await Homework.findById(req.params.id)
  if (!hw) throw ApiError.notFound("Homework not found")
  res.json(hw)
})

export const createHomework = asyncHandler(async (req, res) => {
  const hw = await Homework.create({
    ...req.body,
    createdBy: req.body.createdBy ?? req.user.name,
  })

  // Create a pending submission for every student in the target group.
  const group = await Group.findById(hw.groupId)
  if (group?.studentIds?.length) {
    const docs = group.studentIds.map((studentId) => ({
      homeworkId: hw._id,
      studentId,
      status: "pending",
    }))
    // Ignore duplicates (unique index on homeworkId+studentId).
    await Submission.insertMany(docs, { ordered: false }).catch(() => {})
  }
  res.status(201).json(hw)
})

export const deleteHomework = asyncHandler(async (req, res) => {
  const hw = await Homework.findByIdAndDelete(req.params.id)
  if (!hw) throw ApiError.notFound("Homework not found")
  await Submission.deleteMany({ homeworkId: hw._id })
  res.json({ ok: true })
})

export const listSubmissions = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.homeworkId) filter.homeworkId = req.query.homeworkId
  if (req.query.studentId) filter.studentId = req.query.studentId
  const subs = await Submission.find(filter)
  res.json(subs)
})

/** Teacher/admin grades or updates a submission. */
export const gradeSubmission = asyncHandler(async (req, res) => {
  const patch = { ...req.body }
  if (patch.score != null && !patch.status) patch.status = "graded"
  const sub = await Submission.findByIdAndUpdate(req.params.id, patch, { new: true })
  if (!sub) throw ApiError.notFound("Submission not found")
  res.json(sub)
})

// ---------- Student-facing ----------

/** Homework assigned to the authenticated student, with their submission. */
export const myHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.studentId ?? req.user.id
  const subs = await Submission.find({ studentId })
  const ids = subs.map((s) => s.homeworkId)
  const hw = await Homework.find({ _id: { $in: ids } })
  const byId = new Map(hw.map((h) => [h._id, h]))
  const entries = subs
    .filter((s) => byId.has(s.homeworkId))
    .map((s) => ({ homework: byId.get(s.homeworkId), submission: s }))
  res.json(entries)
})

export const startHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.studentId ?? req.user.id
  const { homeworkId } = req.body
  const existing = await Submission.findOne({ homeworkId, studentId })
  const now = new Date()

  if (!existing) {
    const created = await Submission.create({
      homeworkId,
      studentId,
      status: "in_progress",
      startedAt: now,
    })
    return res.json(created)
  }
  if (["submitted", "graded"].includes(existing.status)) return res.json(existing)

  existing.status = "in_progress"
  existing.startedAt = existing.startedAt ?? now
  await existing.save()
  res.json(existing)
})

export const recordAttempt = asyncHandler(async (req, res) => {
  const studentId = req.user.studentId ?? req.user.id
  const { homeworkId, attempt } = req.body
  const score = bandFromAttempt(attempt.totalQuestions, attempt.correctCount)
  const now = new Date()

  const existing = await Submission.findOne({ homeworkId, studentId })
  if (!existing) {
    const created = await Submission.create({
      homeworkId,
      studentId,
      status: "submitted",
      score,
      startedAt: now,
      submittedAt: now,
      attempt,
    })
    return res.json(created)
  }
  existing.status = "submitted"
  existing.score = score
  existing.startedAt = existing.startedAt ?? now
  existing.submittedAt = now
  existing.attempt = attempt
  await existing.save()
  res.json(existing)
})
