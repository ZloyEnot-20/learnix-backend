import { ControlWork } from "../models/ControlWork.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { Group } from "../models/Group.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { notify, notifyMany } from "../services/notification.service.js"
import { recordAudit } from "../services/audit.service.js"
import {
  recordIntegrityEvent,
  recordControlWorkStep,
  recordVocabActivity,
} from "../services/activity.service.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  resolveOrgId,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"
import { findStudentIdsInGroup, assertSelectableGroup } from "../services/group.service.js"
import { transcribeControlWorkStep } from "../services/speaking-transcription.service.js"
import { env } from "../config/env.js"

const PAUSE_MAX_SECONDS = 30 * 60

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandom(items, count) {
  return shuffle(items).slice(0, Math.min(count, items.length))
}

function bandFromAttempt(total, correct) {
  if (!total || total <= 0) return undefined
  return Math.round((correct / total) * 9 * 2) / 2
}

function freezeActiveTime(sub, at = new Date()) {
  if (!sub.sessionStartedAt) return 0
  const delta = Math.floor((at.getTime() - sub.sessionStartedAt.getTime()) / 1000)
  sub.elapsedSeconds = (sub.elapsedSeconds ?? 0) + Math.max(0, delta)
  sub.sessionStartedAt = null
  return delta
}

async function failForCheating(sub, controlWorkId, studentId, reason, at = new Date()) {
  freezeActiveTime(sub, at)
  sub.integrityStatus = "cheating_detected"
  sub.status = "submitted"
  sub.score = 0
  sub.submittedAt = at
  sub.startedAt = sub.startedAt ?? at
  await sub.save()

  const cw = await ControlWork.findById(controlWorkId)
  await recordIntegrityEvent({
    studentId,
    source: "control_work",
    contextId: controlWorkId,
    contextLabel: cw?.title,
    eventType: "integrity.cheating",
    reason: reason ?? "unknown",
    violationCount: sub.violationCount ?? 0,
  })

  await notify(studentId, {
    type: "result",
    title: cw ? `Progress test failed: ${cw.title}` : "Progress test failed",
    message: "Submission flagged as cheating detected.",
    data: {
      controlWorkTitle: cw?.title,
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

async function resolveSteps(sectionOrder, sections) {
  const steps = []

  for (const subject of sectionOrder) {
    const cfg = sections?.[subject]
    if (!cfg) continue

    if (subject === "grammar") {
      let exercises = []
      if (cfg.mode === "mix") {
        const topics = cfg.topicSlugs ?? []
        if (!topics.length) continue
        const pool = await Exercise.find({ topic: { $in: topics }, category: "grammar" })
        const count = Math.max(1, cfg.mixCount ?? 1)
        exercises = pickRandom(pool, count)
      } else {
        if (cfg.exerciseSlugs?.length) {
          exercises = await Exercise.find({ _id: { $in: cfg.exerciseSlugs } })
        } else if (cfg.topicSlugs?.length) {
          exercises = await Exercise.find({
            topic: { $in: cfg.topicSlugs },
            category: "grammar",
          })
        }
      }
      for (const ex of exercises) {
        steps.push({
          subject: "grammar",
          title: ex.title,
          exerciseSlug: ex.slug,
          topic: ex.topic,
        })
      }
    }

    if (subject === "vocabulary") {
      let decks = []
      if (cfg.mode === "mix") {
        const pool = await VocabDeck.find()
        const count = Math.max(1, cfg.mixCount ?? 1)
        decks = pickRandom(pool, count)
      } else if (cfg.deckSlugs?.length) {
        decks = await VocabDeck.find({ _id: { $in: cfg.deckSlugs } })
      }
      for (const deck of decks) {
        steps.push({
          subject: "vocabulary",
          title: deck.title,
          deckSlug: deck.slug,
        })
      }
    }

    if (subject === "reading" || subject === "listening" || subject === "writing") {
      if (cfg.testId) {
        steps.push({
          subject,
          title: cfg.testTitle?.trim() || cfg.testId,
          testId: cfg.testId,
        })
      }
    }
  }

  return steps
}

function initStepResults(stepCount) {
  return Array.from({ length: stepCount }, (_, i) => ({
    stepIndex: i,
    status: "pending",
  }))
}

function aggregateScore(stepResults) {
  let total = 0
  let correct = 0
  for (const sr of stepResults) {
    if (sr.status !== "completed" || !sr.attempt) continue
    total += sr.attempt.totalQuestions ?? 0
    correct += sr.attempt.correctCount ?? 0
  }
  return bandFromAttempt(total, correct)
}

export const listControlWorks = asyncHandler(async (req, res) => {
  const items = await ControlWork.find(tenantFilter(req)).sort({ createdAt: -1 })
  res.json(items)
})

export const getControlWork = asyncHandler(async (req, res) => {
  const cw = await assertTenantDoc(ControlWork, req.params.id, req)
  res.json(cw)
})

export const createControlWork = asyncHandler(async (req, res) => {
  const { title, description, groupId, dueAt, timeLimitMinutes, sectionOrder, sections } =
    req.body

  const steps = await resolveSteps(sectionOrder ?? [], sections ?? {})
  if (steps.length === 0) {
    throw ApiError.badRequest("At least one section with content is required")
  }

  const group = assertSelectableGroup(await assertOrgGroup(groupId, req))
  const cw = await ControlWork.create(
    withOrgId(req, {
      title,
      description: description ?? "",
      groupId,
      dueAt,
      timeLimitMinutes,
      createdBy: req.body.createdBy ?? req.user.name,
      steps,
    }),
  )

  const studentIds = await findStudentIdsInGroup(group._id, group.orgId)
  if (studentIds.length) {
    const stepResults = initStepResults(steps.length)
    const docs = studentIds.map((studentId) => ({
      orgId: group.orgId,
      controlWorkId: cw._id,
      studentId,
      status: "pending",
      currentStep: 0,
      stepResults,
    }))
    await ControlWorkSubmission.insertMany(docs, { ordered: false }).catch(() => {})
    await notifyMany(studentIds, {
      type: "homework",
      title: `New progress test: ${cw.title}`,
      message: `Your tutor assigned a unit test with ${steps.length} section${steps.length === 1 ? "" : "s"}. Due ${new Date(cw.dueAt).toLocaleDateString()}.`,
      data: {
        controlWorkTitle: cw.title,
        dueAt: cw.dueAt,
        status: "pending",
        kind: "control_work",
      },
    }).catch(() => {})
  }

  await recordAudit({
    req,
    action: "create",
    category: "control_works",
    targetType: "control_work",
    targetId: cw._id,
    targetLabel: cw.title,
    details: {
      groupId,
      groupName: group?.name ?? null,
      stepCount: steps.length,
    },
  })

  res.status(201).json(cw)
})

export const deleteControlWork = asyncHandler(async (req, res) => {
  const cw = await assertTenantDoc(ControlWork, req.params.id, req)
  await ControlWork.findByIdAndDelete(cw._id)
  await ControlWorkSubmission.deleteMany({ controlWorkId: cw._id, ...tenantFilter(req) })

  await recordAudit({
    req,
    action: "delete",
    category: "control_works",
    targetType: "control_work",
    targetId: cw._id,
    targetLabel: cw.title,
  })

  res.json({ ok: true })
})

export const listControlWorkSubmissions = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.controlWorkId) filter.controlWorkId = req.query.controlWorkId
  if (req.query.studentId) filter.studentId = req.query.studentId
  const subs = await ControlWorkSubmission.find(filter)
  res.json(subs)
})

export const myControlWorks = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const subs = await ControlWorkSubmission.find({ studentId })
  const ids = subs.map((s) => s.controlWorkId)
  const works = await ControlWork.find({ _id: { $in: ids } })
  const byId = new Map(works.map((w) => [w._id, w]))
  const entries = subs
    .filter((s) => byId.has(s.controlWorkId))
    .map((s) => ({ controlWork: byId.get(s.controlWorkId), submission: s }))
  res.json(entries)
})

export const startControlWork = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { controlWorkId } = req.body
  const now = new Date()

  let sub = await ControlWorkSubmission.findOne({ controlWorkId, studentId })
  if (!sub) throw ApiError.notFound("Submission not found")

  if (
    sub.integrityStatus === "cheating_detected" ||
    ["submitted", "graded"].includes(sub.status)
  ) {
    return res.json(sub)
  }

  if (sub.status === "paused" && sub.pausedAt) {
    const pausedFor = Math.floor((now.getTime() - sub.pausedAt.getTime()) / 1000)
    if (pausedFor > PAUSE_MAX_SECONDS) {
      await failForCheating(sub, controlWorkId, studentId, "pause_expired", now)
      return res.json(sub)
    }
  }

  if (sub.sessionStartedAt) freezeActiveTime(sub, now)

  sub.status = "in_progress"
  sub.startedAt = sub.startedAt ?? now
  sub.sessionStartedAt = now
  sub.pausedAt = undefined
  await sub.save()
  res.json(sub)
})

export const pauseControlWork = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { controlWorkId } = req.body
  const now = new Date()

  const sub = await ControlWorkSubmission.findOne({ controlWorkId, studentId })
  if (!sub) throw ApiError.notFound("Submission not found")

  if (sub.integrityStatus === "cheating_detected") {
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

export const reportControlWorkViolation = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { controlWorkId, reason } = req.body
  const now = new Date()

  const sub = await ControlWorkSubmission.findOne({ controlWorkId, studentId })
  if (!sub) throw ApiError.notFound("Submission not found")

  if (sub.integrityStatus === "cheating_detected") {
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

  if (!sub.pauseUsed) {
    freezeActiveTime(sub, now)
    sub.status = "paused"
    sub.pausedAt = now
    sub.pauseUsed = true
    sub.violationCount = (sub.violationCount ?? 0) + 1
    sub.integrityStatus = "cheating_suspicion"
    await sub.save()

    const cw = await ControlWork.findById(controlWorkId)
    await recordIntegrityEvent({
      studentId,
      source: "control_work",
      contextId: controlWorkId,
      contextLabel: cw?.title,
      eventType: "integrity.violation",
      reason: reason ?? "unknown",
      violationCount: sub.violationCount,
    })

    return res.json({ action: "pause", submission: sub, pauseUsed: true })
  }

  sub.violationCount = (sub.violationCount ?? 0) + 1
  await sub.save()

  return res.json(await failForCheating(sub, controlWorkId, studentId, reason, now))
})

export const completeControlWorkStep = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { controlWorkId, stepIndex, attempt } = req.body
  const now = new Date()

  const [cw, sub] = await Promise.all([
    ControlWork.findById(controlWorkId),
    ControlWorkSubmission.findOne({ controlWorkId, studentId }),
  ])
  if (!cw) throw ApiError.notFound("Progress test not found")
  if (!sub) throw ApiError.notFound("Submission not found")
  if (sub.integrityStatus === "cheating_detected") return res.json(sub)

  const idx = Number(stepIndex)
  if (idx < 0 || idx >= cw.steps.length) throw ApiError.badRequest("Invalid step index")
  if (sub.stepResults[idx]?.status === "completed") return res.json(sub)
  if (idx !== sub.currentStep) throw ApiError.badRequest("Complete sections in order")

  freezeActiveTime(sub, now)

  const stepResults = [...(sub.stepResults ?? initStepResults(cw.steps.length))]
  stepResults[idx] = {
    stepIndex: idx,
    status: "completed",
    attempt: {
      ...attempt,
      durationSeconds: attempt.durationSeconds ?? sub.elapsedSeconds ?? 0,
    },
    submittedAt: now,
  }
  sub.stepResults = stepResults

  const nextStep = idx + 1
  if (nextStep >= cw.steps.length) {
    sub.status = "submitted"
    sub.submittedAt = now
    sub.currentStep = nextStep
    sub.score = aggregateScore(stepResults)
    sub.sessionStartedAt = null
  } else {
    sub.status = "in_progress"
    sub.currentStep = nextStep
    sub.sessionStartedAt = now
  }

  await sub.save()

  const step = cw.steps[idx]
  await recordControlWorkStep({
    studentId,
    controlWorkId,
    controlWorkTitle: cw.title,
    stepIndex: idx,
    step,
    attempt,
    score: sub.score,
    allComplete: sub.status === "submitted",
  })

  if (step?.subject === "vocabulary" && step.deckSlug) {
    await recordVocabActivity({
      studentId,
      deckSlug: step.deckSlug,
      deckTitle: step.title,
      correct: attempt?.correctCount ?? 0,
      total: attempt?.totalQuestions ?? 0,
      source: "control_work",
    })
  }

  if (step?.subject === "speaking" && env.whisper.enabled) {
    void transcribeControlWorkStep(sub._id, idx).catch((err) =>
      console.error("[whisper] control-work transcription failed:", err.message),
    )
  }

  if (sub.status === "submitted") {
    await notify(studentId, {
      type: "result",
      title: `Progress test completed: ${cw.title}`,
      message:
        typeof sub.score === "number"
          ? `All ${cw.steps.length} sections completed (band ${sub.score.toFixed(1)}).`
          : "Progress test submitted.",
      data: {
        controlWorkTitle: cw.title,
        status: "submitted",
        score: sub.score,
        kind: "control_work",
      },
    }).catch(() => {})
  }

  res.json(sub)
})
