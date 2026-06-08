import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { notify, notifyMany } from "../services/notification.service.js"

/** Max time a student may stay paused before resume counts as cheating. */
const PAUSE_MAX_SECONDS = 30 * 60

function bandFromAttempt(total, correct) {
  if (!total || total <= 0) return undefined
  return Math.round((correct / total) * 9 * 2) / 2
}

/** Move the running segment into elapsedSeconds and clear sessionStartedAt. */
function freezeActiveTime(sub, at = new Date()) {
  if (!sub.sessionStartedAt) return 0
  const delta = Math.floor((at.getTime() - sub.sessionStartedAt.getTime()) / 1000)
  sub.elapsedSeconds = (sub.elapsedSeconds ?? 0) + Math.max(0, delta)
  sub.sessionStartedAt = null
  return delta
}

async function failForCheating(sub, homeworkId, studentId, reason, at = new Date()) {
  freezeActiveTime(sub, at)
  sub.integrityStatus = "cheating_detected"
  sub.status = "submitted"
  sub.score = 0
  sub.submittedAt = at
  sub.startedAt = sub.startedAt ?? at
  sub.attempt = {
    totalQuestions: 0,
    correctCount: 0,
    failedDueToCheating: true,
    cheatingReason: reason ?? "unknown",
    mistakes: [],
  }
  await sub.save()

  const hw = await Homework.findById(homeworkId)
  await notify(studentId, {
    type: "result",
    title: hw ? `Homework failed: ${hw.title}` : "Homework failed",
    message: "Submission flagged as cheating detected.",
    data: {
      homeworkTitle: hw?.title,
      subject: hw?.subject,
      status: "submitted",
      integrityStatus: "cheating_detected",
      score: 0,
    },
  }).catch(() => {})

  return {
    action: "fail",
    violationCount: sub.violationCount ?? 0,
    integrityStatus: "cheating_detected",
    submission: sub,
  }
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
    ? await User.find({ _id: { $in: studentIds }, role: "student" })
    : []

  res.json({
    homework,
    group,
    students: students.map((s) => s.toStudentJSON()),
    submissions,
  })
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
      data: {
        homeworkTitle: hw.title,
        subject: hw.subject,
        dueAt: hw.dueAt,
        status: "pending",
      },
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
      data: {
        homeworkTitle: hw?.title,
        subject: hw?.subject,
        status: "graded",
        score: patch.score != null ? Number(patch.score) : undefined,
      },
    }).catch(() => {})
  }
  res.json(sub)
})

// ---------- Student-facing ----------

/** Homework assigned to the authenticated student, with their submission. */
export const myHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const subs = await Submission.find({ studentId })
  const ids = subs.map((s) => s.homeworkId)
  const hw = await Homework.find({ _id: { $in: ids } })
  const byId = new Map(hw.map((h) => [h._id, h]))
  const entries = subs
    .filter((s) => byId.has(s.homeworkId))
    .map((s) => ({ homework: byId.get(s.homeworkId), submission: s }))
  res.json(entries)
})

/** Begin or resume an active homework session (timer runs only while sessionStartedAt is set). */
export const startHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId } = req.body
  const now = new Date()

  let sub = await Submission.findOne({ homeworkId, studentId })

  if (!sub) {
    sub = await Submission.create({
      homeworkId,
      studentId,
      status: "in_progress",
      startedAt: now,
      sessionStartedAt: now,
      elapsedSeconds: 0,
      pauseUsed: false,
    })
    return res.json(sub)
  }

  if (
    sub.integrityStatus === "cheating_detected" ||
    sub.attempt?.failedDueToCheating ||
    ["submitted", "graded"].includes(sub.status)
  ) {
    return res.json(sub)
  }

  if (sub.status === "paused" && sub.pausedAt) {
    const pausedFor = Math.floor((now.getTime() - sub.pausedAt.getTime()) / 1000)
    if (pausedFor > PAUSE_MAX_SECONDS) {
      await failForCheating(sub, homeworkId, studentId, "pause_expired", now)
      return res.json(sub)
    }
  }

  // Orphan active segment — fold into elapsed before starting a new one.
  if (sub.sessionStartedAt) {
    freezeActiveTime(sub, now)
  }

  sub.status = "in_progress"
  sub.startedAt = sub.startedAt ?? now
  sub.sessionStartedAt = now
  sub.pausedAt = undefined
  await sub.save()
  res.json(sub)
})

export const pauseHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId } = req.body
  const now = new Date()

  const sub = await Submission.findOne({ homeworkId, studentId })
  if (!sub) throw ApiError.notFound("Submission not found")

  if (sub.integrityStatus === "cheating_detected" || sub.attempt?.failedDueToCheating) {
    return res.json({ action: "fail", submission: sub, pauseUsed: true })
  }
  if (["submitted", "graded"].includes(sub.status)) {
    return res.json({ action: "already_done", submission: sub, pauseUsed: sub.pauseUsed ?? false })
  }

  freezeActiveTime(sub, now)
  sub.status = "paused"
  sub.pausedAt = now
  sub.pauseUsed = true
  await sub.save()

  return res.json({ action: "paused", submission: sub, pauseUsed: true })
})

export const reportViolation = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId, reason } = req.body
  const now = new Date()

  const sub = await Submission.findOne({ homeworkId, studentId })
  if (!sub) {
    return res.json({
      action: "pause",
      pauseUsed: true,
      submission: await Submission.create({
        homeworkId,
        studentId,
        status: "paused",
        startedAt: now,
        pausedAt: now,
        elapsedSeconds: 0,
        pauseUsed: true,
      }),
    })
  }

  if (sub.integrityStatus === "cheating_detected" || sub.attempt?.failedDueToCheating) {
    return res.json({
      action: "fail",
      pauseUsed: true,
      integrityStatus: "cheating_detected",
      submission: sub,
    })
  }
  if (["submitted", "graded"].includes(sub.status)) {
    return res.json({
      action: "already_done",
      pauseUsed: sub.pauseUsed ?? false,
      submission: sub,
    })
  }

  // First leave: graceful pause (same as the Pause button).
  if (!sub.pauseUsed) {
    freezeActiveTime(sub, now)
    sub.status = "paused"
    sub.pausedAt = now
    sub.pauseUsed = true
    await sub.save()
    return res.json({ action: "pause", submission: sub, pauseUsed: true })
  }

  return res.json(await failForCheating(sub, homeworkId, studentId, reason, now))
})

export const recordAttempt = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId, attempt } = req.body
  const score = bandFromAttempt(attempt.totalQuestions, attempt.correctCount)
  const now = new Date()

  const existing = await Submission.findOne({ homeworkId, studentId })
  // Already-finished submissions must not re-trigger the completion notification
  // (avoids duplicate Telegram messages on re-submit or a double request).
  const alreadyDone = !!existing && ["submitted", "graded"].includes(existing.status)
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
    freezeActiveTime(existing, now)
    existing.status = "submitted"
    existing.score = score
    existing.startedAt = existing.startedAt ?? now
    existing.submittedAt = now
    existing.attempt = {
      ...attempt,
      durationSeconds: attempt.durationSeconds ?? existing.elapsedSeconds ?? 0,
    }
    await existing.save()
    result = existing
  }

  if (alreadyDone) return res.json(result)

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
    data: {
      homeworkTitle: hw?.title,
      subject: hw?.subject,
      dueAt: hw?.dueAt,
      status: "submitted",
      correctCount: attempt.correctCount,
      totalQuestions: attempt.totalQuestions,
      score: typeof score === "number" ? score : undefined,
    },
  }).catch(() => {})

  res.json(result)
})
