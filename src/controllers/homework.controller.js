import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Group } from "../models/Group.js"
import { Student } from "../models/Student.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { notify, notifyMany } from "../services/notification.service.js"

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

/**
 * A homework together with everything needed to render its results in one
 * round-trip: the assignment, its group, the group's students, and every
 * submission tied to this homework (submissions are linked directly via
 * `Submission.homeworkId`).
 */
export const getHomeworkDetails = asyncHandler(async (req, res) => {
  const homework = await Homework.findById(req.params.id)
  if (!homework) throw ApiError.notFound("Homework not found")

  const [group, submissions] = await Promise.all([
    Group.findById(homework.groupId),
    Submission.find({ homeworkId: homework._id }),
  ])
  const studentIds = group?.studentIds ?? []
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } })
    : []

  res.json({ homework, group, students, submissions })
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
    await notifyMany(group.studentIds, {
      type: "homework",
      title: `New homework: ${hw.title}`,
      message: `Your tutor assigned a new task. Due ${new Date(hw.dueAt).toLocaleDateString()}.`,
    }).catch(() => {})
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

  // Notify the student when their work gets a grade or feedback.
  if (patch.score != null || patch.feedback) {
    const hw = await Homework.findById(sub.homeworkId)
    await notify(sub.studentId, {
      type: "result",
      title: hw ? `Homework graded: ${hw.title}` : "Homework graded",
      message:
        patch.score != null
          ? `Your tutor scored your work ${Number(patch.score).toFixed(1)}.`
          : "Your tutor left feedback on your work.",
    }).catch(() => {})
  }
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
  let result
  if (!existing) {
    result = await Submission.create({
      homeworkId,
      studentId,
      status: "submitted",
      score,
      startedAt: now,
      submittedAt: now,
      attempt,
    })
  } else {
    existing.status = "submitted"
    existing.score = score
    existing.startedAt = existing.startedAt ?? now
    existing.submittedAt = now
    existing.attempt = attempt
    await existing.save()
    result = existing
  }

  // Notify (the student and, via the Telegram bot, their parents) that a task
  // was completed — this is one of the activities parents subscribe to.
  const hw = await Homework.findById(homeworkId)
  await notify(studentId, {
    type: "result",
    title: hw ? `Homework completed: ${hw.title}` : "Homework completed",
    message:
      typeof score === "number"
        ? `Completed with ${attempt.correctCount}/${attempt.totalQuestions} correct (band ${score.toFixed(1)}).`
        : "Homework submitted.",
  }).catch(() => {})

  res.json(result)
})
