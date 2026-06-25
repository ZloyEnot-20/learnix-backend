import { StudentActivity } from "../models/StudentActivity.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { User } from "../models/User.js"
import { Submission } from "../models/Submission.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { TestResult } from "../models/TestResult.js"
import { Homework } from "../models/Homework.js"
import { Exercise } from "../models/Exercise.js"
import { aggregateHomeworkIntegrity, isCheatingSubmission } from "./submission.service.js"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : null
}

/**
 * Persist a student activity event. Failures are logged but never block the request.
 */
async function resolveStudentOrgId(studentId, orgId) {
  if (orgId) return orgId
  if (!studentId) return null
  const student = await User.findById(studentId).select("orgId")
  return student?.orgId ?? null
}

export async function recordStudentActivity(input) {
  try {
    const accuracy =
      input.accuracy ??
      (input.correctCount != null && input.totalQuestions != null
        ? pct(input.correctCount, input.totalQuestions)
        : null)

    const orgId = await resolveStudentOrgId(input.studentId, input.orgId)
    await StudentActivity.create({
      ...input,
      orgId,
      accuracy,
      at: input.at ?? new Date(),
    })
  } catch (err) {
    console.error("[activity]", err)
  }
}

export async function recordIntegrityEvent({
  studentId,
  source,
  contextId,
  contextLabel,
  subject,
  eventType,
  reason,
  violationCount,
  metadata,
}) {
  await recordStudentActivity({
    studentId,
    eventType,
    category: "integrity",
    source,
    subject,
    contextId,
    contextLabel,
    failedDueToCheating: eventType === "integrity.cheating",
    metadata: { reason, violationCount, ...metadata },
  })
}

export async function recordExerciseActivity({
  studentId,
  source,
  subject,
  contextId,
  contextLabel,
  topic,
  subtopic,
  slug,
  title,
  type,
  correctCount,
  totalQuestions,
  timedOut,
  durationSeconds,
  score,
  mistakes,
  metadata,
}) {
  await recordStudentActivity({
    studentId,
    eventType: "exercise.complete",
    category: subject === "vocabulary" ? "vocabulary" : "grammar",
    source,
    subject: subject ?? "grammar",
    contextId,
    contextLabel,
    materialSlug: slug,
    materialTitle: title,
    correctCount,
    totalQuestions,
    timedOut,
    durationSeconds,
    score,
    metadata: {
      topic,
      subtopic,
      type,
      mistakes: mistakes?.length ? mistakes : undefined,
      ...metadata,
    },
  })
}

/** @deprecated Homework records live on Submission only — kept for API compatibility. */
export async function recordHomeworkAssigned() {}

/** @deprecated Homework records live on Submission only — kept for API compatibility. */
export async function recordHomeworkSubmit() {}

export async function recordControlWorkStep({
  studentId,
  controlWorkId,
  controlWorkTitle,
  stepIndex,
  step,
  attempt,
  score,
  allComplete,
}) {
  await recordStudentActivity({
    studentId,
    eventType: allComplete ? "control_work.complete" : "control_work.step",
    category: "control_work",
    source: "control_work",
    subject: step?.subject,
    contextId: controlWorkId,
    contextLabel: controlWorkTitle,
    materialSlug: step?.exerciseSlug ?? step?.deckSlug ?? step?.testId,
    materialTitle: step?.title,
    correctCount: attempt?.correctCount,
    totalQuestions: attempt?.totalQuestions,
    durationSeconds: attempt?.durationSeconds,
    timedOut: attempt?.timedOut,
    score: allComplete ? score : undefined,
    metadata: {
      stepIndex,
      mistakes: attempt?.mistakes?.length ? attempt.mistakes : undefined,
    },
  })
}

export async function recordVocabActivity({
  studentId,
  deckSlug,
  deckTitle,
  correct,
  total,
  source,
  words,
}) {
  await recordStudentActivity({
    studentId,
    eventType: "vocab.quiz_complete",
    category: "vocabulary",
    source,
    subject: "vocabulary",
    materialSlug: deckSlug,
    materialTitle: deckTitle,
    correctCount: correct,
    totalQuestions: total,
    metadata: {
      wordsLearned: words?.length ?? 0,
      words: words?.slice(0, 50),
    },
  })
}

export async function recordTestActivity({ studentId, testType, bandScore, totalCorrect, totalQuestions }) {
  await recordStudentActivity({
    studentId,
    eventType: "test.complete",
    category: "mock_test",
    source: "mock_test",
    subject: testType,
    materialSlug: testType,
    materialTitle: `${testType} mock test`,
    correctCount: totalCorrect,
    totalQuestions: totalQuestions,
    score: bandScore,
  })
}

/** Staff dashboard summary for one student. */
export async function buildStudentSummary(studentId) {
  const [
    activities,
    exerciseEvents,
    homeworkSubs,
    controlSubs,
    testResults,
    homeworkById,
  ] = await Promise.all([
    StudentActivity.find({ studentId }).sort({ at: -1 }).limit(500).lean(),
    ExerciseEvent.find({ studentId }).lean(),
    Submission.find({ studentId }).lean(),
    ControlWorkSubmission.find({ studentId }).lean(),
    TestResult.find({ studentId }).lean(),
    Homework.find().select("_id subject title").lean().then((rows) => new Map(rows.map((h) => [h._id, h]))),
  ])

  const integrityEvents = activities.filter((a) => a.category === "integrity")
  const homeworkIntegrity = aggregateHomeworkIntegrity(homeworkSubs)
  const cheatingEvents = integrityEvents.filter(
    (a) => a.eventType === "integrity.cheating" || a.failedDueToCheating,
  )
  const violationEvents = integrityEvents.filter((a) => a.eventType === "integrity.violation")

  const byReason = { ...homeworkIntegrity.byReason }
  for (const e of integrityEvents) {
    if (e.source === "homework") continue
    const reason = e.metadata?.reason ?? "unknown"
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }

  const legacyCheating = homeworkSubs.filter(
    (s) => s.integrityStatus === "cheating_detected" || s.attempt?.failedDueToCheating,
  ).length
  const legacyControlCheating = controlSubs.filter(
    (s) => s.integrityStatus === "cheating_detected",
  ).length

  const subjectStats = {}
  function bumpSubject(subject, correct, total, score) {
    const key = subject ?? "unknown"
    if (!subjectStats[key]) {
      subjectStats[key] = { attempts: 0, correct: 0, total: 0, scores: [] }
    }
    subjectStats[key].attempts += 1
    subjectStats[key].correct += correct ?? 0
    subjectStats[key].total += total ?? 0
    if (typeof score === "number") subjectStats[key].scores.push(score)
  }

  for (const sub of homeworkSubs) {
    if (!sub.attempt || sub.status === "pending") continue
    const hw = homeworkById.get(sub.homeworkId)
    bumpSubject(hw?.subject, sub.attempt.correctCount, sub.attempt.totalQuestions, sub.score)
  }

  for (const e of exerciseEvents) {
    bumpSubject("grammar", e.correctCount, e.totalQuestions)
  }

  for (const a of activities) {
    if (a.category === "integrity" || a.category === "mock_test") continue
    if (a.source === "homework" || a.category === "homework") continue
    if (a.correctCount != null || a.totalQuestions != null) {
      bumpSubject(a.subject, a.correctCount, a.totalQuestions, a.score)
    }
  }

  const bySubject = Object.entries(subjectStats).map(([subject, s]) => ({
    subject,
    attempts: s.attempts,
    accuracy: pct(s.correct, s.total),
    avgScore:
      s.scores.length > 0
        ? Math.round((s.scores.reduce((a, b) => a + b, 0) / s.scores.length) * 10) / 10
        : null,
  }))

  const topicMap = new Map()
  for (const e of exerciseEvents) {
    const row = topicMap.get(e.topic) ?? { topic: e.topic, attempts: 0, correct: 0, total: 0 }
    row.attempts += 1
    row.correct += e.correctCount ?? 0
    row.total += e.totalQuestions ?? 0
    topicMap.set(e.topic, row)
  }
  const grammarByTopic = [...topicMap.values()]
    .map((r) => ({ ...r, accuracy: pct(r.correct, r.total) }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))

  const vocabActivities = activities.filter((a) => a.category === "vocabulary")
  const learnedTerms = new Set()
  for (const a of vocabActivities) {
    for (const w of a.metadata?.words ?? []) {
      if (w?.term) learnedTerms.add(String(w.term).toLowerCase())
    }
  }

  const deckMap = new Map()
  for (const a of vocabActivities) {
    const slug = a.materialSlug ?? "unknown"
    const row = deckMap.get(slug) ?? {
      deckSlug: slug,
      deckTitle: a.materialTitle ?? slug,
      attempts: 0,
      correct: 0,
      total: 0,
    }
    row.attempts += 1
    row.correct += a.correctCount ?? 0
    row.total += a.totalQuestions ?? 0
    deckMap.set(slug, row)
  }
  const vocabularyByDeck = [...deckMap.values()]
    .map((r) => ({ ...r, accuracy: pct(r.correct, r.total) }))
    .sort((a, b) => b.attempts - a.attempts)

  const testsByType = {}
  for (const t of testResults) {
    if (!testsByType[t.testType]) {
      testsByType[t.testType] = { count: 0, bands: [] }
    }
    testsByType[t.testType].count += 1
    testsByType[t.testType].bands.push(t.bandScore)
  }
  const mockTests = Object.entries(testsByType).map(([testType, s]) => ({
    testType,
    count: s.count,
    avgBand:
      s.bands.length > 0
        ? Math.round((s.bands.reduce((a, b) => a + b, 0) / s.bands.length) * 10) / 10
        : null,
  }))

  const homeworkFailed = homeworkSubs.filter(
    (s) => s.integrityStatus === "cheating_detected" || s.attempt?.failedDueToCheating,
  )
  const homeworkCompleted = homeworkSubs.filter((s) =>
    ["submitted", "graded"].includes(s.status),
  ).length
  const homeworkByTopic = {}
  for (const sub of homeworkSubs) {
    const topic = sub.topic ?? homeworkById.get(sub.homeworkId)?.subject ?? "unknown"
    if (!homeworkByTopic[topic]) {
      homeworkByTopic[topic] = {
        topic,
        assigned: 0,
        completed: 0,
        failed: 0,
        cheating: 0,
        totalEntries: 0,
      }
    }
    const row = homeworkByTopic[topic]
    row.assigned += 1
    row.totalEntries += sub.entryCount ?? 0
    if (sub.integrityStatus === "cheating_detected" || sub.attempt?.failedDueToCheating) {
      row.cheating += 1
      row.failed += 1
    } else if (["submitted", "graded"].includes(sub.status)) {
      row.completed += 1
    } else if (sub.status === "pending") {
      // assigned only
    }
  }
  const controlCompleted = controlSubs.filter((s) =>
    ["submitted", "graded"].includes(s.status),
  ).length

  return {
    integrity: {
      violations: homeworkIntegrity.violations + violationEvents.filter((e) => e.source !== "homework").length,
      cheatingIncidents:
        homeworkIntegrity.cheating +
        cheatingEvents.filter((e) => e.source !== "homework").length +
        legacyControlCheating,
      byReason,
    },
    homework: {
      completed: homeworkCompleted,
      cheating: legacyCheating,
      failed: homeworkFailed.length,
      byTopic: Object.values(homeworkByTopic).sort((a, b) => b.assigned - a.assigned),
      assignments: homeworkSubs.map((s) => ({
        homeworkId: s.homeworkId,
        homeworkTitle: s.homeworkTitle ?? homeworkById.get(s.homeworkId)?.title,
        topic: s.topic ?? homeworkById.get(s.homeworkId)?.subject,
        subject: s.subject ?? homeworkById.get(s.homeworkId)?.subject,
        status: s.status,
        integrityStatus: s.integrityStatus ?? "ok",
        failedDueToCheating:
          s.integrityStatus === "cheating_detected" || !!s.attempt?.failedDueToCheating,
        entryCount: s.entryCount ?? 0,
        lastEntryAt: s.lastEntryAt,
        violationCount: s.violationCount ?? 0,
        elapsedSeconds: s.elapsedSeconds ?? 0,
        score: s.score ?? null,
        assignedAt: s.assignedAt,
        submittedAt: s.submittedAt,
        attempt: s.attempt
          ? {
              correctCount: s.attempt.correctCount,
              totalQuestions: s.attempt.totalQuestions,
              timedOut: s.attempt.timedOut,
            }
          : null,
      })),
    },
    controlWorks: {
      completed: controlCompleted,
      cheating: legacyControlCheating,
    },
    bySubject,
    grammarByTopic,
    vocabulary: {
      wordsLearned: learnedTerms.size,
      deckAttempts: vocabActivities.length,
      byDeck: vocabularyByDeck,
    },
    mockTests,
    recentActivity: activities.slice(0, 20).map((a) => ({
      id: a._id,
      eventType: a.eventType,
      category: a.category,
      subject: a.subject,
      contextLabel: a.contextLabel,
      materialTitle: a.materialTitle,
      accuracy: a.accuracy,
      at: a.at,
    })),
  }
}

function avgRounded(nums) {
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/**
 * Org-wide per-exercise statistics for the admin dashboard:
 * homework assignments, completion / cheating / failure rates, practice accuracy.
 */
export async function buildExerciseStats(orgFilter = {}) {
  const [submissions, homeworks, events, exercises, vocabActivities] = await Promise.all([
    Submission.find(orgFilter).lean(),
    Homework.find(orgFilter).select("_id exerciseSlug subject title").lean(),
    ExerciseEvent.find(orgFilter).lean(),
    Exercise.find().select("slug title topic subtopic type level category").lean(),
    StudentActivity.find({ ...orgFilter, category: "vocabulary" }).lean(),
  ])

  const hwById = new Map(homeworks.map((h) => [h._id, h]))
  const exerciseMeta = new Map(exercises.map((e) => [e.slug, e]))
  const bySlug = new Map()

  function ensureRow(slug, defaults = {}) {
    if (!bySlug.has(slug)) {
      const meta = exerciseMeta.get(slug)
      bySlug.set(slug, {
        slug,
        title: meta?.title ?? defaults.title ?? slug,
        topic: meta?.topic ?? defaults.topic ?? null,
        subtopic: meta?.subtopic ?? null,
        type: meta?.type ?? defaults.type ?? null,
        level: meta?.level ?? null,
        subject: meta?.category ?? defaults.subject ?? "grammar",
        assigned: 0,
        started: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        paused: 0,
        cheating: 0,
        failed: 0,
        suspicion: 0,
        timedOut: 0,
        practiceAttempts: 0,
        practiceCorrect: 0,
        practiceTotal: 0,
        practiceTimeouts: 0,
        scores: [],
      })
    }
    return bySlug.get(slug)
  }

  for (const sub of submissions) {
    const hw = hwById.get(sub.homeworkId)
    const slug = sub.topic || hw?.exerciseSlug || hw?.subject
    if (!slug || slug === "unknown") continue

    const row = ensureRow(slug, {
      title: sub.homeworkTitle || hw?.title,
      subject: hw?.subject ?? "grammar",
    })
    row.assigned += 1

    const cheating = isCheatingSubmission(sub)
    const completed =
      ["submitted", "graded"].includes(sub.status) && !cheating

    if (cheating) {
      row.cheating += 1
      row.failed += 1
    } else if (completed) {
      row.completed += 1
      if (sub.attempt?.timedOut) row.timedOut += 1
      if (typeof sub.score === "number") row.scores.push(sub.score)
    } else if (sub.status === "in_progress") {
      row.inProgress += 1
    } else if (sub.status === "paused") {
      row.paused += 1
      if (sub.integrityStatus === "cheating_suspicion") row.suspicion += 1
    } else if (sub.status === "pending") {
      row.pending += 1
    }

    if (sub.status !== "pending") row.started += 1
  }

  for (const e of events) {
    const row = ensureRow(e.slug, { title: e.title, topic: e.topic, type: e.type })
    row.practiceAttempts += 1
    row.practiceCorrect += e.correctCount ?? 0
    row.practiceTotal += e.totalQuestions ?? 0
    if (e.timedOut) row.practiceTimeouts += 1
  }

  for (const a of vocabActivities) {
    const slug = a.materialSlug
    if (!slug) continue
    const row = ensureRow(slug, {
      title: a.materialTitle ?? slug,
      subject: "vocabulary",
    })
    row.practiceAttempts += 1
    row.practiceCorrect += a.correctCount ?? 0
    row.practiceTotal += a.totalQuestions ?? 0
    if (a.timedOut) row.practiceTimeouts += 1
  }

  const exercisesList = [...bySlug.values()].map((row) => {
    const completionRate = pct(row.completed, row.assigned)
    const startedRate = pct(row.started, row.assigned)
    const cheatingRate = pct(row.cheating, row.assigned)
    const failureRate = pct(row.failed, row.assigned)
    const suspicionRate = pct(row.suspicion, row.assigned)
    const practiceAccuracy = pct(row.practiceCorrect, row.practiceTotal)
    const avgScore = avgRounded(row.scores)

    return {
      slug: row.slug,
      title: row.title,
      topic: row.topic,
      subtopic: row.subtopic,
      type: row.type,
      level: row.level,
      subject: row.subject,
      assigned: row.assigned,
      started: row.started,
      completed: row.completed,
      inProgress: row.inProgress,
      pending: row.pending,
      paused: row.paused,
      cheating: row.cheating,
      failed: row.failed,
      suspicion: row.suspicion,
      timedOut: row.timedOut,
      practiceAttempts: row.practiceAttempts,
      practiceTimeouts: row.practiceTimeouts,
      completionRate,
      startedRate,
      cheatingRate,
      failureRate,
      suspicionRate,
      practiceAccuracy,
      avgScore,
    }
  })

  exercisesList.sort((a, b) => b.assigned - a.assigned || b.practiceAttempts - a.practiceAttempts)

  const byTopicMap = new Map()
  for (const ex of exercisesList) {
    const key = ex.topic ?? ex.subject ?? "other"
    const group = byTopicMap.get(key) ?? {
      topic: key,
      label: key.replace(/-/g, " "),
      assigned: 0,
      completed: 0,
      cheating: 0,
      failed: 0,
      practiceAttempts: 0,
      exercises: [],
    }
    group.assigned += ex.assigned
    group.completed += ex.completed
    group.cheating += ex.cheating
    group.failed += ex.failed
    group.practiceAttempts += ex.practiceAttempts
    group.exercises.push(ex)
    byTopicMap.set(key, group)
  }

  const topics = [...byTopicMap.values()]
    .map((g) => ({
      ...g,
      completionRate: pct(g.completed, g.assigned),
      cheatingRate: pct(g.cheating, g.assigned),
      failureRate: pct(g.failed, g.assigned),
      exercises: g.exercises.sort((a, b) => b.assigned - a.assigned),
    }))
    .sort((a, b) => b.assigned - a.assigned)

  const totalAssigned = exercisesList.reduce((a, e) => a + e.assigned, 0)
  const totalCompleted = exercisesList.reduce((a, e) => a + e.completed, 0)
  const totalCheating = exercisesList.reduce((a, e) => a + e.cheating, 0)
  const totalFailed = exercisesList.reduce((a, e) => a + e.failed, 0)
  const totalPractice = exercisesList.reduce((a, e) => a + e.practiceAttempts, 0)

  const weakest = [...exercisesList]
    .filter((e) => e.assigned >= 3)
    .sort((a, b) => (a.completionRate ?? 100) - (b.completionRate ?? 100))[0]
  const mostCheating = [...exercisesList]
    .filter((e) => e.cheating > 0)
    .sort((a, b) => (b.cheatingRate ?? 0) - (a.cheatingRate ?? 0))[0]

  return {
    summary: {
      exercisesTracked: exercisesList.length,
      totalAssigned,
      totalCompleted,
      totalCheating,
      totalFailed,
      totalPracticeAttempts: totalPractice,
      completionRate: pct(totalCompleted, totalAssigned),
      cheatingRate: pct(totalCheating, totalAssigned),
      failureRate: pct(totalFailed, totalAssigned),
      weakestExercise: weakest ?? null,
      mostCheatingExercise: mostCheating ?? null,
    },
    exercises: exercisesList,
    topics,
  }
}
