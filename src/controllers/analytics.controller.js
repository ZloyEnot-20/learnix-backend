import { StudentActivity } from "../models/StudentActivity.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {
  recordExerciseActivity,
  recordVocabActivity,
  buildStudentSummary,
  buildExerciseStats,
} from "../services/activity.service.js"
import {
  recordWordAnswer,
  recordDeckQuizCompletion,
  syncLearnProgress,
  getStudentLearnProgress,
  getVocabWordStats,
  getVocabDeckStats,
} from "../services/vocabulary-progress.service.js"
import { applyStudentPointsDelta, recomputeLearnGamification } from "../services/gamification.service.js"
import { POINTS } from "../config/level-thresholds.js"
import { assertStudentInOrg, tenantFilter } from "../services/tenantScope.service.js"
import { isStaffType } from "../constants/userTypes.js"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

function resolveStudentId(req) {
  if (req.user.type === "student") return req.user.id
  if (req.params.studentId) return req.params.studentId
  if (req.query.studentId) return String(req.query.studentId)
  return null
}

/** Record one finished grammar-exercise attempt. */
export const recordEvent = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { source, homeworkId, controlWorkId, durationSeconds, ...body } = req.body

  const event = await ExerciseEvent.create({
    ...body,
    studentId,
    orgId: req.user.orgId ?? null,
  })

  await recordExerciseActivity({
    studentId,
    source: source ?? (homeworkId ? "homework" : controlWorkId ? "control_work" : "game"),
    subject: "grammar",
    contextId: homeworkId ?? controlWorkId,
    topic: body.topic,
    subtopic: body.subtopic,
    slug: body.slug,
    title: body.title,
    type: body.type,
    correctCount: body.correctCount,
    totalQuestions: body.totalQuestions,
    timedOut: body.timedOut,
    durationSeconds,
  })

  const correctCount = body.correctCount ?? 0
  if (correctCount > 0) {
    await applyStudentPointsDelta(studentId, {
      exercisePoints: correctCount * POINTS.EXERCISE_CORRECT,
    }).catch((err) => {
      console.error("[gamification] exercise points update failed", err)
    })
  }

  res.status(201).json({ id: event._id })
})

/** Record vocabulary quiz completion + words learned. */
export const recordVocab = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { deckSlug, deckTitle, correct, total, source, words, wordAnswers, totalWords } = req.body

  await recordVocabActivity({
    studentId,
    deckSlug,
    deckTitle,
    correct,
    total,
    source: source ?? "game",
    words,
  })

  await recordDeckQuizCompletion({
    studentId,
    orgId: req.user.orgId ?? null,
    deckSlug,
    deckTitle,
    correct,
    total,
    totalWords: totalWords ?? words?.length ?? 0,
    wordAnswers: wordAnswers ?? [],
  })

  res.status(201).json({ ok: true })
})

/** Record a single vocabulary word answer (review). */
export const recordVocabWord = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { term, deckSlug, correct, interactionType } = req.body

  const result = await recordWordAnswer({
    studentId,
    orgId: req.user.orgId ?? null,
    term,
    deckSlug,
    correct,
    source: "review",
    interactionType: interactionType ?? "multiple_choice",
  })

  res.status(201).json(result)
})

/** Bulk sync learn progress from mobile AsyncStorage. */
export const syncLearn = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const { studyWords, vocabResults } = req.body

  const result = await syncLearnProgress(studentId, req.user.orgId ?? null, {
    studyWords,
    vocabResults,
  })

  await recomputeLearnGamification(studentId).catch((err) => {
    console.error("[gamification] learn recompute after sync failed", err)
  })

  res.json(result)
})

/** Get student learn/vocabulary progress. */
export const learnProgress = asyncHandler(async (req, res) => {
  const studentId = resolveStudentId(req)
  if (!studentId) throw ApiError.badRequest("studentId is required")
  if (req.user.type === "student" && studentId !== req.user.id) {
    throw ApiError.forbidden()
  }
  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }

  const progress = await getStudentLearnProgress(studentId)
  res.json(progress)
})

/** Staff: vocabulary words ranked by error rate. */
export const vocabWordStats = asyncHandler(async (req, res) => {
  if (!isStaffType(req.user.type)) {
    throw ApiError.forbidden("Staff access required")
  }
  const orgId = req.user.orgId
  if (!orgId) throw ApiError.badRequest("Organization context required")

  const stats = await getVocabWordStats(orgId, {
    deckSlug: req.query.deckSlug,
    limit: Number(req.query.limit) || 50,
  })
  res.json(stats)
})

/** Staff: deck engagement stats. */
export const vocabDeckStats = asyncHandler(async (req, res) => {
  if (!isStaffType(req.user.type)) {
    throw ApiError.forbidden("Staff access required")
  }
  const orgId = req.user.orgId
  if (!orgId) throw ApiError.badRequest("Organization context required")

  const stats = await getVocabDeckStats(orgId, {
    limit: Number(req.query.limit) || 50,
  })
  res.json(stats)
})

/** List student activity events (staff or own). */
export const listActivity = asyncHandler(async (req, res) => {
  const studentId = resolveStudentId(req)
  if (!studentId) throw ApiError.badRequest("studentId is required")
  if (req.user.type === "student" && studentId !== req.user.id) {
    throw ApiError.forbidden()
  }

  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const skip = (page - 1) * limit

  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }

  const filter = { studentId, ...tenantFilter(req) }
  if (req.query.category && req.query.category !== "all") filter.category = req.query.category
  if (req.query.eventType && req.query.eventType !== "all") filter.eventType = req.query.eventType

  const [items, total] = await Promise.all([
    StudentActivity.find(filter).sort({ at: -1 }).skip(skip).limit(limit),
    StudentActivity.countDocuments(filter),
  ])

  res.json({
    items: items.map((d) => d.toJSON()),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  })
})

/** Aggregated analytics summary for one student. */
export const studentSummary = asyncHandler(async (req, res) => {
  const studentId = req.params.studentId ?? req.user.id
  if (req.user.type === "student" && studentId !== req.user.id) {
    throw ApiError.forbidden()
  }
  if (req.user.type !== "student") {
    await assertStudentInOrg(studentId, req)
  }
  const summary = await buildStudentSummary(studentId)
  res.json(summary)
})

/** Aggregate events into a topic → subtopic → exercise tree. */
export const topicStats = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.user.type === "student") {
    filter.studentId = req.user.id
  } else if (req.query.studentId) {
    filter.studentId = req.query.studentId
    await assertStudentInOrg(req.query.studentId, req)
  }

  const events = await ExerciseEvent.find(filter)
  const byTopic = new Map()
  for (const e of events) {
    const arr = byTopic.get(e.topic) ?? []
    arr.push(e)
    byTopic.set(e.topic, arr)
  }

  const topics = []
  for (const [topic, topicEvents] of byTopic) {
    const bySub = new Map()
    for (const e of topicEvents) {
      const key = e.subtopic ?? "general"
      const arr = bySub.get(key) ?? []
      arr.push(e)
      bySub.set(key, arr)
    }

    const subtopics = []
    for (const [subtopic, subEvents] of bySub) {
      const byEx = new Map()
      for (const e of subEvents) {
        const arr = byEx.get(e.slug) ?? []
        arr.push(e)
        byEx.set(e.slug, arr)
      }
      const exercises = []
      for (const [slug, exEvents] of byEx) {
        const totalCorrect = exEvents.reduce((a, e) => a + e.correctCount, 0)
        const totalQuestions = exEvents.reduce((a, e) => a + e.totalQuestions, 0)
        exercises.push({
          slug,
          title: exEvents[0].title,
          topic,
          subtopic: exEvents[0].subtopic,
          type: exEvents[0].type,
          attempts: exEvents.length,
          totalCorrect,
          totalQuestions,
          timeouts: exEvents.filter((e) => e.timedOut).length,
          accuracy: pct(totalCorrect, totalQuestions),
        })
      }
      const subCorrect = subEvents.reduce((a, e) => a + e.correctCount, 0)
      const subTotal = subEvents.reduce((a, e) => a + e.totalQuestions, 0)
      subtopics.push({
        subtopic,
        attempts: subEvents.length,
        accuracy: pct(subCorrect, subTotal),
        exercises: exercises.sort((a, b) => a.accuracy - b.accuracy),
      })
    }

    const topicCorrect = topicEvents.reduce((a, e) => a + e.correctCount, 0)
    const topicTotal = topicEvents.reduce((a, e) => a + e.totalQuestions, 0)
    topics.push({
      topic,
      attempts: topicEvents.length,
      accuracy: pct(topicCorrect, topicTotal),
      timeouts: topicEvents.filter((e) => e.timedOut).length,
      subtopics: subtopics.sort((a, b) => a.accuracy - b.accuracy),
    })
  }

  res.json(topics.sort((a, b) => a.accuracy - b.accuracy))
})

/** Per-exercise homework + practice statistics for staff dashboard. */
export const exerciseStats = asyncHandler(async (req, res) => {
  if (!isStaffType(req.user.type)) {
    throw ApiError.forbidden("Staff access required")
  }
  const stats = await buildExerciseStats(tenantFilter(req))
  res.json(stats)
})
