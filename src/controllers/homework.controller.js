import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Exercise } from "../models/Exercise.js"
import { Podcast } from "../models/Podcast.js"
import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { notify, notifyMany } from "../services/notification.service.js"
import { recordAudit } from "../services/audit.service.js"
import {
  recordVocabActivity,
} from "../services/activity.service.js"
import { appendSubmissionEvent } from "../services/submission.service.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  findOrgGroup,
  resolveOrgId,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"
import { findStudentIdsInGroup, serializeGroupDoc, assertSelectableGroup, resourceGroupIds } from "../services/group.service.js"
import { STAFF_PERMISSIONS } from "../constants/staffPermissions.js"
import { transcribeHomeworkSubmission } from "../services/speaking-transcription.service.js"
import { env } from "../config/env.js"

/** Max time a student may stay paused before resume counts as cheating. */
const PAUSE_MAX_SECONDS = 30 * 60
/** Max allowed homework session entries before auto-fail (first open + one resume). */
const MAX_HOMEWORK_ENTRIES = 2
/** Duplicate start calls within this window count as the same visit (remount). */
const SESSION_REENTRY_GRACE_MS = 60_000
const PODCAST_SLUG_PREFIX = "podcast:"

function parsePodcastHomeworkSlug(exerciseSlug) {
  if (!exerciseSlug) return null
  return exerciseSlug.startsWith(PODCAST_SLUG_PREFIX)
    ? exerciseSlug.slice(PODCAST_SLUG_PREFIX.length)
    : null
}

function leanListeningStats(stats) {
  if (!stats) return undefined
  return {
    totalListenSeconds: stats.totalListenSeconds ?? 0,
    seekCount: stats.seekCount ?? 0,
    rewindCount: stats.rewindCount ?? 0,
    forwardCount: stats.forwardCount ?? 0,
    podcastDurationSeconds: stats.podcastDurationSeconds ?? 0,
    completedListening: stats.completedListening ?? false,
    wordsReviewed: stats.wordsReviewed ?? 0,
  }
}

function leanHomeworkListSubmission(sub) {
  const attempt = sub.attempt
  return {
    id: sub._id,
    homeworkId: sub.homeworkId,
    studentId: sub.studentId,
    topic: sub.topic,
    subject: sub.subject,
    status: sub.status,
    integrityStatus: sub.integrityStatus,
    pauseUsed: sub.pauseUsed,
    submittedAt: sub.submittedAt,
    elapsedSeconds: sub.elapsedSeconds,
    sessionStartedAt: sub.sessionStartedAt,
    startedAt: sub.startedAt,
    attempt: attempt
      ? {
          correctCount: attempt.correctCount,
          totalQuestions: attempt.totalQuestions,
          failedDueToCheating: attempt.failedDueToCheating,
          answeredCount: attempt.answeredCount,
          listeningStats: leanListeningStats(attempt.listeningStats),
        }
      : undefined,
  }
}

function leanHomeworkDoc(hw) {
  return {
    id: hw._id,
    title: hw.title,
    description: hw.description,
    subject: hw.subject,
    dueAt: hw.dueAt,
    createdAt: hw.createdAt,
    exerciseSlug: hw.exerciseSlug,
    timeLimitMinutes: hw.timeLimitMinutes,
  }
}

function homeworkTopic(hw) {
  return hw?.exerciseSlug ?? hw?.subject ?? "unknown"
}

function shouldCountHomeworkEntry(sub, now) {
  if (sub.status === "pending" || sub.status === "paused") return true
  if (sub.status !== "in_progress") return false
  const lastStart = sub.sessionStartedAt?.getTime() ?? 0
  if (!lastStart) return true
  return now.getTime() - lastStart >= SESSION_REENTRY_GRACE_MS
}

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
  appendSubmissionEvent(sub, {
    type: "cheating",
    reason: reason ?? "unknown",
    entryCount: sub.entryCount ?? 0,
    metadata: { violationCount: sub.violationCount ?? 0 },
  })
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

export const listHomework = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  const groupIds = await resourceGroupIds(req, STAFF_PERMISSIONS.HOMEWORK_VIEW_ALL)
  if (groupIds !== null) filter.groupId = { $in: groupIds }
  const homework = await Homework.find(filter).sort({ createdAt: -1 })
  res.json(homework)
})

export const getHomework = asyncHandler(async (req, res) => {
  let hw
  if (req.user.type === "student") {
    const sub = await Submission.findOne({
      homeworkId: req.params.id,
      studentId: req.user.id,
    })
    if (!sub) throw ApiError.notFound("Homework not found")
    hw = await Homework.findById(req.params.id)
  } else {
    hw = await assertTenantDoc(Homework, req.params.id, req)
    await assertOrgGroup(hw.groupId, req)
  }
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
  const homework = await assertTenantDoc(Homework, req.params.id, req)
  const group = await assertOrgGroup(homework.groupId, req)

  const orgId = resolveOrgId(req)
  const submissionFilter = { homeworkId: homework._id, ...tenantFilter(req) }
  const submissions = await Submission.find(submissionFilter)
  const studentIds = await findStudentIdsInGroup(group._id, orgId)
  const students = studentIds.length
    ? await User.find({
        _id: { $in: studentIds },
        type: "student",
        ...(orgId ? { orgId } : {}),
      })
    : []

  res.json({
    homework,
    group: await serializeGroupDoc(group),
    students: students.map((s) => s.toStudentJSON()),
    submissions,
  })
})

export const createHomework = asyncHandler(async (req, res) => {
  const group = assertSelectableGroup(await assertOrgGroup(req.body.groupId, req))
  const hw = await Homework.create(
    withOrgId(req, {
      ...req.body,
      createdBy: req.body.createdBy ?? req.user.name,
    }),
  )

  // Create a pending submission for every student in the target group.
  const studentIds = await findStudentIdsInGroup(group._id, group.orgId)
  const topic = homeworkTopic(hw)
  if (studentIds.length) {
    const assignedAt = new Date()
    const docs = studentIds.map((studentId) => ({
      orgId: group.orgId,
      homeworkId: hw._id,
      studentId,
      topic,
      subject: hw.subject,
      homeworkTitle: hw.title,
      assignedAt,
      entryCount: 0,
      status: "pending",
      integrityStatus: "ok",
      events: [{ at: assignedAt, type: "assigned" }],
    }))
    // Ignore duplicates (unique index on homeworkId+studentId).
    await Submission.insertMany(docs, { ordered: false }).catch(() => {})
    await notifyMany(studentIds, {
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

  await recordAudit({
    req,
    action: "create",
    category: "homework",
    targetType: "homework",
    targetId: hw._id,
    targetLabel: hw.title,
    details: {
      groupId: hw.groupId,
      groupName: group?.name ?? null,
      subject: hw.subject,
    },
  })

  res.status(201).json(hw)
})

export const deleteHomework = asyncHandler(async (req, res) => {
  const hw = await assertTenantDoc(Homework, req.params.id, req)
  const group = await findOrgGroup(hw.groupId, req)
  if (!group) throw ApiError.forbidden("Homework not found in your organization")
  await Homework.findByIdAndDelete(hw._id)
  await Submission.deleteMany({ homeworkId: hw._id, ...tenantFilter(req) })

  await recordAudit({
    req,
    action: "delete",
    category: "homework",
    targetType: "homework",
    targetId: hw._id,
    targetLabel: hw.title,
  })

  res.json({ ok: true })
})

export const listSubmissions = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.homeworkId) filter.homeworkId = req.query.homeworkId
  if (req.query.studentId) filter.studentId = req.query.studentId
  const subs = await Submission.find(filter)
  res.json(subs)
})

/** Homework check dashboard — assignments + all student records from Submission. */
export const homeworkCheck = asyncHandler(async (req, res) => {
  const filter = tenantFilter(req)
  const [assignments, records] = await Promise.all([
    Homework.find(filter).sort({ createdAt: -1 }),
    Submission.find(filter).sort({ assignedAt: -1 }),
  ])
  res.json({ assignments, records })
})

/** Teacher/admin grades or updates a submission. */
export const gradeSubmission = asyncHandler(async (req, res) => {
  const patch = { ...req.body }
  const recordingGrades = patch.recordingGrades
  delete patch.recordingGrades

  if (patch.score != null && !patch.status) patch.status = "graded"
  await assertTenantDoc(Submission, req.params.id, req)
  const sub = await Submission.findById(req.params.id)
  if (!sub) throw ApiError.notFound("Submission not found")

  if (recordingGrades?.length && sub.attempt?.mistakes?.length) {
    for (const grade of recordingGrades) {
      const mistake = sub.attempt.mistakes.find((m) => m.questionId === grade.questionId)
      if (!mistake) continue
      if (grade.score != null) mistake.score = grade.score
      if (grade.feedback !== undefined) {
        mistake.feedback = grade.feedback.trim() || undefined
      }
    }
    sub.markModified("attempt")
    if (!patch.status) patch.status = "graded"
  }

  Object.assign(sub, patch)
  const hasRecordingGrades = recordingGrades?.some(
    (g) => g.score != null || (g.feedback && g.feedback.trim()),
  )
  if (patch.score != null || patch.feedback || hasRecordingGrades) {
    appendSubmissionEvent(sub, {
      type: "graded",
      metadata: {
        score: patch.score != null ? Number(patch.score) : undefined,
        hasFeedback: !!patch.feedback || !!hasRecordingGrades,
        recordingCount: recordingGrades?.length,
      },
    })
  }
  await sub.save()

  // Notify the student when their work gets a grade or feedback.
  if (patch.score != null || patch.feedback || hasRecordingGrades) {
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

/** Staff: reset a student's submission so they can solve the homework again. */
export const retrySubmission = asyncHandler(async (req, res) => {
  await assertTenantDoc(Submission, req.params.id, req)
  const sub = await Submission.findById(req.params.id)
  if (!sub) throw ApiError.notFound("Submission not found")

  const hasProgress =
    sub.status !== "pending" ||
    !!sub.attempt ||
    !!sub.startedAt ||
    (sub.entryCount ?? 0) > 0
  if (!hasProgress) {
    throw ApiError.badRequest("Student has not started this homework yet")
  }

  const previousStatus = sub.status
  const previousScore = sub.score
  const previousAttempt = sub.attempt
    ? {
        correctCount: sub.attempt.correctCount,
        totalQuestions: sub.attempt.totalQuestions,
        score: sub.score,
        status: sub.status,
        integrityStatus: sub.integrityStatus,
      }
    : undefined

  sub.status = "pending"
  sub.integrityStatus = "ok"
  sub.violationCount = 0
  sub.elapsedSeconds = 0
  sub.pauseUsed = false
  sub.entryCount = 0
  sub.unset("score")
  sub.unset("feedback")
  sub.unset("attempt")
  sub.unset("startedAt")
  sub.unset("sessionStartedAt")
  sub.unset("pausedAt")
  sub.unset("submittedAt")
  sub.unset("lastEntryAt")

  appendSubmissionEvent(sub, {
    type: "retry",
    metadata: {
      previousStatus,
      previousScore,
      previousAttempt,
      resetBy: req.user.name,
    },
  })
  await sub.save()

  const hw = await Homework.findById(sub.homeworkId)
  await notify(sub.studentId, {
    type: "homework",
    title: hw ? `Practice again: ${hw.title}` : "Homework retry assigned",
    message: "Your tutor asked you to complete this homework again to reinforce the material.",
    data: {
      homeworkTitle: hw?.title,
      subject: hw?.subject,
      dueAt: hw?.dueAt,
      status: "pending",
    },
  }).catch(() => {})

  await recordAudit({
    req,
    action: "update",
    category: "homework",
    targetType: "submission",
    targetId: sub._id,
    targetLabel: hw?.title ?? sub.homeworkId,
    details: {
      studentId: sub.studentId,
      homeworkId: sub.homeworkId,
      previousStatus,
      previousScore,
    },
  })

  res.json(sub)
})

/** Staff: (re)run Whisper transcription for a speaking submission. */
export const transcribeSubmission = asyncHandler(async (req, res) => {
  if (!env.whisper.enabled) {
    throw new ApiError(503, "Whisper service is not configured")
  }

  await assertTenantDoc(Submission, req.params.id, req)
  const sub = await Submission.findById(req.params.id)
  if (!sub) throw ApiError.notFound("Submission not found")

  const hw = await Homework.findById(sub.homeworkId)
  if (hw?.subject !== "speaking") {
    throw ApiError.badRequest("Transcription is only available for speaking homework")
  }

  const hasAudio = sub.attempt?.mistakes?.some((m) => /^https?:\/\//i.test(m.userAnswer ?? ""))
  if (!hasAudio) {
    throw ApiError.badRequest("No speaking recordings found in this submission")
  }

  await transcribeHomeworkSubmission(sub._id)
  const updated = await Submission.findById(sub._id)
  res.json(updated)
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

/** Lightweight homework list for mobile — no events/telemetry arrays, includes route hints. */
export const myHomeworkSummary = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const subs = await Submission.find({ studentId })
    .select(
      "homeworkId status integrityStatus pauseUsed submittedAt elapsedSeconds sessionStartedAt startedAt topic subject attempt.correctCount attempt.totalQuestions attempt.failedDueToCheating attempt.answeredCount attempt.listeningStats.wordsReviewed attempt.listeningStats.totalListenSeconds attempt.listeningStats.seekCount attempt.listeningStats.rewindCount attempt.listeningStats.forwardCount attempt.listeningStats.podcastDurationSeconds attempt.listeningStats.completedListening",
    )
    .lean()

  const ids = subs.map((s) => s.homeworkId)
  const hwDocs = await Homework.find({ _id: { $in: ids } })
    .select("title description subject dueAt createdAt exerciseSlug timeLimitMinutes")
    .lean()
  const byId = new Map(hwDocs.map((h) => [h._id, h]))

  const exerciseSlugs = [
    ...new Set(
      hwDocs
        .filter(
          (h) =>
            (h.subject === "grammar" || h.subject === "speaking") && h.exerciseSlug,
        )
        .map((h) => h.exerciseSlug),
    ),
  ]

  const exerciseMeta = new Map()
  if (exerciseSlugs.length > 0) {
    const exercises = await Exercise.find({ _id: { $in: exerciseSlugs } })
      .select("slug topic title category")
      .lean()
    for (const ex of exercises) {
      exerciseMeta.set(ex.slug, ex)
    }
  }

  const podcastReviewSlugs = new Map()
  for (const sub of subs) {
    const hw = byId.get(sub.homeworkId)
    if (!hw) continue
    const podcastSlug = parsePodcastHomeworkSlug(hw.exerciseSlug)
    const wordsReviewed = sub.attempt?.listeningStats?.wordsReviewed ?? 0
    if (podcastSlug && wordsReviewed > 0) {
      podcastReviewSlugs.set(podcastSlug, wordsReviewed)
    }
  }

  const podcastWordsBySlug = new Map()
  if (podcastReviewSlugs.size > 0) {
    const podcasts = await Podcast.find({ _id: { $in: [...podcastReviewSlugs.keys()] } })
      .select("slug words")
      .lean()
    for (const episode of podcasts) {
      const words = (episode.words ?? [])
        .map((w) => (w.word ?? w.term ?? "").trim())
        .filter(Boolean)
      podcastWordsBySlug.set(episode.slug, words)
    }
  }

  const entries = subs
    .filter((s) => byId.has(s.homeworkId))
    .map((s) => {
      const hw = byId.get(s.homeworkId)
      const meta = hw.exerciseSlug ? exerciseMeta.get(hw.exerciseSlug) : undefined
      const podcastSlug = parsePodcastHomeworkSlug(hw.exerciseSlug)
      const wordsReviewed = s.attempt?.listeningStats?.wordsReviewed ?? 0
      let reviewedWordLabels
      if (podcastSlug && wordsReviewed > 0) {
        const words = podcastWordsBySlug.get(podcastSlug) ?? []
        reviewedWordLabels = words.slice(0, wordsReviewed)
      }

      return {
        homework: leanHomeworkDoc(hw),
        submission: leanHomeworkListSubmission(s),
        exerciseTopic: meta?.topic,
        exerciseTitle: meta?.title,
        reviewedWordLabels,
      }
    })

  res.json(entries)
})

/** Increment session entry counter on each homework open (mobile anti-cheat). */
export const recordHomeworkEntry = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId } = req.body
  const now = new Date()

  const hw = await Homework.findById(homeworkId)
  if (!hw) throw ApiError.notFound("Homework not found")

  let sub = await Submission.findOne({ homeworkId, studentId })

  if (!sub) {
    const orgId = resolveOrgId(req)
    if (!orgId) throw ApiError.forbidden("Organization context required")
    sub = await Submission.create({
      orgId,
      homeworkId,
      studentId,
      topic: homeworkTopic(hw),
      subject: hw?.subject,
      homeworkTitle: hw.title,
      assignedAt: now,
      lastEntryAt: now,
      entryCount: 1,
      status: "pending",
      pauseUsed: false,
      events: [{ at: now, type: "entry", entryCount: 1 }],
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

  sub.entryCount = (sub.entryCount ?? 0) + 1
  sub.lastEntryAt = now
  if (sub.entryCount > MAX_HOMEWORK_ENTRIES) {
    await failForCheating(sub, homeworkId, studentId, "excessive_entries", now)
    return res.json(sub)
  }

  appendSubmissionEvent(sub, { type: "entry", entryCount: sub.entryCount })
  await sub.save()
  res.json(sub)
})

/** Begin or resume an active homework session (timer runs only while sessionStartedAt is set). */
export const startHomework = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId, skipEntryCount = false } = req.body
  const now = new Date()

  let sub = await Submission.findOne({ homeworkId, studentId })

  const hw = await Homework.findById(homeworkId)

  if (!sub) {
    const orgId = resolveOrgId(req)
    if (!orgId) throw ApiError.forbidden("Organization context required")
    sub = await Submission.create({
      orgId,
      homeworkId,
      studentId,
      topic: homeworkTopic(hw),
      subject: hw?.subject,
      homeworkTitle: hw?.title,
      assignedAt: now,
      entryCount: skipEntryCount ? 0 : 1,
      status: "in_progress",
      startedAt: now,
      sessionStartedAt: now,
      elapsedSeconds: 0,
      pauseUsed: false,
      events: [{ at: now, type: "start", entryCount: skipEntryCount ? 0 : 1 }],
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

  if (!sub.topic && hw) {
    sub.topic = homeworkTopic(hw)
    sub.homeworkTitle = hw.title
    sub.subject = hw.subject
  }

  if (!skipEntryCount && shouldCountHomeworkEntry(sub, now)) {
    sub.entryCount = (sub.entryCount ?? 0) + 1
    if (sub.entryCount > MAX_HOMEWORK_ENTRIES) {
      await failForCheating(sub, homeworkId, studentId, "excessive_entries", now)
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
  appendSubmissionEvent(sub, { type: "start", entryCount: sub.entryCount ?? 0 })
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
  if (sub.status === "paused") {
    return res.json({ action: "paused", submission: sub, pauseUsed: sub.pauseUsed ?? true })
  }

  freezeActiveTime(sub, now)
  sub.status = "paused"
  sub.pausedAt = now
  sub.pauseUsed = true
  appendSubmissionEvent(sub, { type: "pause" })
  await sub.save()

  return res.json({ action: "paused", submission: sub, pauseUsed: true })
})

export const reportViolation = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId, reason } = req.body
  const now = new Date()

  const sub = await Submission.findOne({ homeworkId, studentId })
  if (!sub) {
    const orgId = resolveOrgId(req)
    if (!orgId) throw ApiError.forbidden("Organization context required")
    const hw = await Homework.findById(homeworkId)
    return res.json({
      action: "warn",
      pauseUsed: false,
      submission: await Submission.create({
        orgId,
        homeworkId,
        studentId,
        topic: homeworkTopic(hw),
        subject: hw?.subject,
        homeworkTitle: hw?.title,
        assignedAt: now,
        entryCount: 1,
        status: "in_progress",
        startedAt: now,
        sessionStartedAt: now,
        elapsedSeconds: 0,
        pauseUsed: false,
        integrityStatus: "cheating_suspicion",
        violationCount: 1,
        events: [
          { at: now, type: "violation", reason: reason ?? "unknown", entryCount: 1 },
        ],
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

  // First leave: warn only — the student keeps their pause until they choose it.
  if (!sub.pauseUsed && sub.integrityStatus !== "cheating_suspicion") {
    sub.violationCount = (sub.violationCount ?? 0) + 1
    sub.integrityStatus = "cheating_suspicion"
    appendSubmissionEvent(sub, {
      type: "violation",
      reason: reason ?? "unknown",
      entryCount: sub.entryCount ?? 0,
      metadata: { violationCount: sub.violationCount },
    })
    await sub.save()

    return res.json({ action: "warn", submission: sub, pauseUsed: false })
  }

  sub.violationCount = (sub.violationCount ?? 0) + 1
  await sub.save()

  return res.json(await failForCheating(sub, homeworkId, studentId, reason, now))
})

export const recordAttempt = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { homeworkId, attempt } = req.body
  const now = new Date()

  const existing = await Submission.findOne({ homeworkId, studentId })
  // Already-finished submissions must not re-trigger the completion notification
  // (avoids duplicate Telegram messages on re-submit or a double request).
  const alreadyDone = !!existing && ["submitted", "graded"].includes(existing.status)
  const hw = await Homework.findById(homeworkId)
  const isSpeaking = hw?.subject === "speaking"
  const isListening = hw?.subject === "listening"
  const score =
    isSpeaking || isListening
      ? undefined
      : bandFromAttempt(attempt.totalQuestions, attempt.correctCount)
  let result
  if (!existing) {
    const orgId = resolveOrgId(req)
    if (!orgId) throw ApiError.forbidden("Organization context required")
    result = await Submission.create({
      orgId,
      homeworkId,
      studentId,
      topic: homeworkTopic(hw),
      subject: hw?.subject,
      homeworkTitle: hw?.title,
      assignedAt: now,
      entryCount: 1,
      status: "submitted",
      score,
      startedAt: now,
      submittedAt: now,
      attempt,
      events: [
        {
          at: now,
          type: "submit",
          metadata: {
            correctCount: attempt.correctCount,
            totalQuestions: attempt.totalQuestions,
            score,
          },
        },
      ],
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
    if (!existing.subject && hw) existing.subject = hw.subject
    appendSubmissionEvent(existing, {
      type: "submit",
      metadata: {
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        score,
      },
    })
    await existing.save()
    result = existing
  }

  if (alreadyDone) return res.json(result)

  if (hw?.subject === "vocabulary") {
    await recordVocabActivity({
      studentId,
      deckSlug: hw.exerciseSlug ?? hw._id,
      deckTitle: hw.title,
      correct: attempt.correctCount,
      total: attempt.totalQuestions,
      source: "homework",
    })
  }

  // Notify (the student and, via the Telegram bot, their parents) that a task
  // was completed — this is one of the activities parents subscribe to.
  const listenStats = attempt.listeningStats
  const listeningMessage = listenStats
    ? `Podcast completed. Listened ${Math.round(listenStats.totalListenSeconds)}s` +
      (listenStats.seekCount > 0 ? `, ${listenStats.seekCount} seeks` : "") +
      (listenStats.wordsReviewed > 0 ? `, ${listenStats.wordsReviewed} words reviewed` : "") +
      "."
    : "Podcast listening homework submitted."

  await notify(studentId, {
    type: "result",
    title: hw ? `Homework completed: ${hw.title}` : "Homework completed",
    message: isSpeaking
      ? `Speaking homework submitted (${attempt.answeredCount ?? attempt.correctCount}/${attempt.totalQuestions} recordings). Awaiting teacher review.`
      : isListening
        ? listeningMessage
        : typeof score === "number"
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

  if (isSpeaking && env.whisper.enabled && !alreadyDone) {
    void transcribeHomeworkSubmission(result._id).catch((err) =>
      console.error("[whisper] homework transcription failed:", err.message),
    )
  }

  res.json(result)
})
