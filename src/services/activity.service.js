import { StudentActivity } from "../models/StudentActivity.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { Submission } from "../models/Submission.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { TestResult } from "../models/TestResult.js"
import { Homework } from "../models/Homework.js"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : null
}

/**
 * Persist a student activity event. Failures are logged but never block the request.
 */
export async function recordStudentActivity(input) {
  try {
    const accuracy =
      input.accuracy ??
      (input.correctCount != null && input.totalQuestions != null
        ? pct(input.correctCount, input.totalQuestions)
        : null)

    await StudentActivity.create({
      ...input,
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

export async function recordHomeworkSubmit({
  studentId,
  homeworkId,
  homeworkTitle,
  subject,
  attempt,
  score,
}) {
  await recordStudentActivity({
    studentId,
    eventType: "homework.submit",
    category: "homework",
    source: "homework",
    subject,
    contextId: homeworkId,
    contextLabel: homeworkTitle,
    materialSlug: attempt?.exerciseSlug,
    correctCount: attempt?.correctCount,
    totalQuestions: attempt?.totalQuestions,
    durationSeconds: attempt?.durationSeconds,
    timedOut: attempt?.timedOut,
    score,
    failedDueToCheating: attempt?.failedDueToCheating,
    metadata: {
      mistakes: attempt?.mistakes?.length ? attempt.mistakes : undefined,
      answeredCount: attempt?.answeredCount,
    },
  })
}

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
  const cheatingEvents = integrityEvents.filter(
    (a) => a.eventType === "integrity.cheating" || a.failedDueToCheating,
  )
  const violationEvents = integrityEvents.filter((a) => a.eventType === "integrity.violation")

  const byReason = {}
  for (const e of integrityEvents) {
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

  const homeworkCompleted = homeworkSubs.filter((s) =>
    ["submitted", "graded"].includes(s.status),
  ).length
  const controlCompleted = controlSubs.filter((s) =>
    ["submitted", "graded"].includes(s.status),
  ).length

  return {
    integrity: {
      violations: violationEvents.length,
      cheatingIncidents: cheatingEvents.length + legacyCheating + legacyControlCheating,
      byReason,
    },
    homework: {
      completed: homeworkCompleted,
      cheating: legacyCheating,
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
