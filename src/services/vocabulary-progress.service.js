import { StudentWordProgress } from "../models/StudentWordProgress.js"
import { StudentDeckProgress } from "../models/StudentDeckProgress.js"
import { WordAnswerEvent } from "../models/WordAnswerEvent.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { User } from "../models/User.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { MASTERY_CORRECT_THRESHOLD, MASTERED_MAINTENANCE_DAYS, POINTS } from "../config/level-thresholds.js"

const VOCAB_HOMEWORK_PREFIX = "vocab:"

function parseVocabHomeworkSlug(exerciseSlug) {
  if (!exerciseSlug?.startsWith(VOCAB_HOMEWORK_PREFIX)) return null
  return exerciseSlug.slice(VOCAB_HOMEWORK_PREFIX.length)
}

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : null
}

function daysSince(date, now = new Date()) {
  if (!date) return 0
  return (now.getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
}

function isDueForMaintenanceReview(word, now = new Date()) {
  if (!word.masteredAt || word.permanentlyMastered) return false
  if ((word.correctCount ?? 0) < MASTERY_CORRECT_THRESHOLD) return false
  return daysSince(word.masteredAt, now) >= MASTERED_MAINTENANCE_DAYS
}

async function resolveOrgId(studentId, orgId) {
  if (orgId) return orgId
  const student = await User.findById(studentId).select("orgId")
  return student?.orgId ?? null
}

function learnPointsDeltaForWordAnswer({ correct, source, newlyMastered }) {
  let learnPoints = 0
  if (correct && source === "review") learnPoints += POINTS.WORD_REVIEW_CORRECT
  if (correct && source === "quiz") learnPoints += POINTS.VOCAB_QUIZ_CORRECT
  if (newlyMastered) learnPoints += POINTS.WORD_MASTERED
  return learnPoints
}

async function applyLearnPointsDelta(studentId, learnPoints) {
  if (learnPoints <= 0) return
  const { applyStudentPointsDelta } = await import("./gamification.service.js")
  await applyStudentPointsDelta(studentId, { learnPoints }).catch((err) => {
    console.error("[gamification] learn points update failed", err)
  })
}

/**
 * Record one word answer: immutable event + upsert word/deck aggregates.
 */
export async function recordWordAnswer({
  studentId,
  orgId,
  term,
  deckSlug,
  correct,
  source,
  interactionType = "multiple_choice",
}) {
  const resolvedOrgId = await resolveOrgId(studentId, orgId)

  await WordAnswerEvent.create({
    studentId,
    orgId: resolvedOrgId,
    term,
    deckSlug,
    correct,
    source,
    interactionType,
  })

  const now = new Date()
  const existing = await StudentWordProgress.findOne({ studentId, deckSlug, term })

  if (existing) {
    const isMaintenance = isDueForMaintenanceReview(existing, now)

    if (isMaintenance) {
      existing.totalAttempts += 1
      existing.lastReviewedAt = now

      if (correct) {
        existing.permanentlyMastered = true
        existing.correctCount += 1
        existing.consecutiveCorrect = (existing.consecutiveCorrect ?? 0) + 1
        existing.accuracy = pct(existing.correctCount, existing.totalAttempts)
        await existing.save()

        await applyLearnPointsDelta(
          studentId,
          learnPointsDeltaForWordAnswer({ correct, source, newlyMastered: false }),
        )

        return { word: existing.toObject(), newlyMastered: false, permanentlyRetired: true }
      }

      existing.incorrectCount += 1
      existing.consecutiveCorrect = 0
      existing.correctCount = 0
      existing.masteredAt = null
      existing.wantToLearn = true
      existing.accuracy = pct(existing.correctCount, existing.totalAttempts)
      await existing.save()

      await StudentDeckProgress.updateOne(
        { studentId, deckSlug },
        { $inc: { wordsMastered: -1 } },
      )

      await applyLearnPointsDelta(studentId, 0)

      return { word: existing.toObject(), newlyMastered: false, maintenanceFailed: true }
    }

    const correctCount = existing.correctCount + (correct ? 1 : 0)
    const incorrectCount = existing.incorrectCount + (correct ? 0 : 1)
    const totalAttempts = existing.totalAttempts + 1
    const consecutiveCorrect = correct ? (existing.consecutiveCorrect ?? 0) + 1 : 0
    const wasMastered = existing.masteredAt != null && existing.correctCount >= MASTERY_CORRECT_THRESHOLD
    const newlyMastered = !wasMastered && correctCount >= MASTERY_CORRECT_THRESHOLD

    existing.correctCount = correctCount
    existing.incorrectCount = incorrectCount
    existing.totalAttempts = totalAttempts
    existing.accuracy = pct(correctCount, totalAttempts)
    existing.consecutiveCorrect = consecutiveCorrect
    existing.lastReviewedAt = now
    if (newlyMastered) existing.masteredAt = now
    await existing.save()

    if (newlyMastered) {
      await StudentDeckProgress.updateOne(
        { studentId, deckSlug },
        { $inc: { wordsMastered: 1 } },
      )
    }

    await applyLearnPointsDelta(
      studentId,
      learnPointsDeltaForWordAnswer({ correct, source, newlyMastered }),
    )

    return { word: existing.toObject(), newlyMastered }
  }

  const correctCount = correct ? 1 : 0
  const incorrectCount = correct ? 0 : 1
  const consecutiveCorrect = correct ? 1 : 0
  const newlyMastered = correctCount >= MASTERY_CORRECT_THRESHOLD

  const word = await StudentWordProgress.create({
    studentId,
    orgId: resolvedOrgId,
    deckSlug,
    term,
    correctCount,
    incorrectCount,
    totalAttempts: 1,
    accuracy: pct(correctCount, 1),
    consecutiveCorrect,
    masteredAt: newlyMastered ? now : null,
    permanentlyMastered: false,
    lastReviewedAt: now,
  })

  if (newlyMastered) {
    await StudentDeckProgress.updateOne(
      { studentId, deckSlug },
      { $inc: { wordsMastered: 1 } },
      { upsert: true },
    )
  }

  await applyLearnPointsDelta(
    studentId,
    learnPointsDeltaForWordAnswer({ correct, source, newlyMastered }),
  )

  return { word: word.toObject(), newlyMastered }
}

/**
 * Upsert deck progress after a vocab quiz completion.
 */
export async function recordDeckQuizCompletion({
  studentId,
  orgId,
  deckSlug,
  deckTitle,
  correct,
  total,
  totalWords,
  wordAnswers = [],
}) {
  const resolvedOrgId = await resolveOrgId(studentId, orgId)
  const accuracy = pct(correct, total)

  await StudentDeckProgress.findOneAndUpdate(
    { studentId, deckSlug },
    {
      $setOnInsert: { studentId, deckSlug, orgId: resolvedOrgId },
      $set: { deckTitle, totalWords: totalWords ?? 0 },
      $inc: { quizAttempts: 1, quizCorrectSum: correct },
      $max: { bestAccuracy: accuracy ?? 0 },
    },
    { upsert: true, new: true },
  )

  for (const answer of wordAnswers) {
    await recordWordAnswer({
      studentId,
      orgId: resolvedOrgId,
      term: answer.term,
      deckSlug: answer.deckSlug ?? deckSlug,
      correct: answer.correct,
      source: "quiz",
      interactionType: answer.interactionType ?? "multiple_choice",
    })
  }

  await applyLearnPointsDelta(studentId, POINTS.VOCAB_DECK_COMPLETE)
}

/**
 * Bulk sync from mobile AsyncStorage (studyWords + vocabResults).
 */
export async function syncLearnProgress(studentId, orgId, { studyWords = [], vocabResults = [] }) {
  const resolvedOrgId = await resolveOrgId(studentId, orgId)
  let wordsUpserted = 0
  let decksUpserted = 0
  const deckAgg = new Map()

  for (const sw of studyWords) {
    if (!sw.term || !sw.deckSlug) continue
    const correctCount = sw.correctCount ?? 0
    const incorrectCount = sw.incorrectCount ?? Math.max(0, (sw.totalAttempts ?? correctCount) - correctCount)
    const totalAttempts = sw.totalAttempts ?? correctCount + incorrectCount
    const masteredAt = sw.masteredAt ? new Date(sw.masteredAt) : null
    const permanentlyMastered = sw.permanentlyMastered ?? false

    await StudentWordProgress.findOneAndUpdate(
      { studentId, deckSlug: sw.deckSlug, term: sw.term },
      {
        $set: {
          orgId: resolvedOrgId,
          correctCount,
          incorrectCount,
          totalAttempts,
          consecutiveCorrect: correctCount,
          accuracy: pct(correctCount, totalAttempts),
          masteredAt,
          permanentlyMastered,
          wantToLearn: sw.wantToLearn ?? false,
          lastReviewedAt: sw.lastReviewedAt ? new Date(sw.lastReviewedAt) : null,
        },
      },
      { upsert: true },
    )
    wordsUpserted += 1
  }

  for (const result of vocabResults) {
    if (!result.deckSlug) continue
    const cur = deckAgg.get(result.deckSlug) ?? {
      deckTitle: result.deckTitle ?? "",
      attempts: 0,
      correctSum: 0,
      bestAccuracy: 0,
    }
    cur.attempts += 1
    cur.correctSum += result.correct ?? 0
    const accuracy = pct(result.correct, result.total)
    cur.bestAccuracy = Math.max(cur.bestAccuracy, accuracy ?? 0)
    if (result.deckTitle) cur.deckTitle = result.deckTitle
    deckAgg.set(result.deckSlug, cur)
  }

  for (const [deckSlug, agg] of deckAgg) {
    await StudentDeckProgress.findOneAndUpdate(
      { studentId, deckSlug },
      {
        $setOnInsert: { studentId, deckSlug, orgId: resolvedOrgId },
        $set: { deckTitle: agg.deckTitle },
        $max: {
          quizAttempts: agg.attempts,
          quizCorrectSum: agg.correctSum,
          bestAccuracy: agg.bestAccuracy,
        },
      },
      { upsert: true },
    )
    decksUpserted += 1
  }

  return { wordsUpserted, decksUpserted }
}

/**
 * When vocabulary homework is assigned, queue all deck words for daily review.
 */
export async function assignHomeworkDeckToReview({ studentIds, orgId, exerciseSlug }) {
  const deckSlug = parseVocabHomeworkSlug(exerciseSlug)
  if (!deckSlug || !studentIds?.length) return { wordsAssigned: 0, students: 0 }

  const deck = await VocabDeck.findById(deckSlug).select("words slug").lean()
  if (!deck?.words?.length) return { wordsAssigned: 0, students: 0 }

  let wordsAssigned = 0
  for (const studentId of studentIds) {
    for (const word of deck.words) {
      const term = word.term
      if (!term) continue

      const existing = await StudentWordProgress.findOne({ studentId, deckSlug, term }).lean()
      if (existing?.permanentlyMastered) continue
      if (
        existing?.masteredAt &&
        (existing.correctCount ?? 0) >= MASTERY_CORRECT_THRESHOLD
      ) {
        continue
      }

      await StudentWordProgress.findOneAndUpdate(
        { studentId, deckSlug, term },
        {
          $set: { orgId, wantToLearn: true },
          $setOnInsert: {
            studentId,
            deckSlug,
            term,
            correctCount: 0,
            incorrectCount: 0,
            totalAttempts: 0,
            consecutiveCorrect: 0,
            permanentlyMastered: false,
          },
        },
        { upsert: true },
      )
      wordsAssigned += 1
    }
  }

  return { wordsAssigned, students: studentIds.length }
}

/** Full learn progress for a student. */
export async function getStudentLearnProgress(studentId) {
  const [words, decks] = await Promise.all([
    StudentWordProgress.find({ studentId }).sort({ lastReviewedAt: -1 }).lean(),
    StudentDeckProgress.find({ studentId }).sort({ quizAttempts: -1 }).lean(),
  ])

  const wordsMastered = words.filter(
    (w) => w.masteredAt != null && w.correctCount >= MASTERY_CORRECT_THRESHOLD,
  ).length

  return {
    wordsMastered,
    totalWordsTracked: words.length,
    words: words.map((w) => ({
      term: w.term,
      deckSlug: w.deckSlug,
      correctCount: w.correctCount,
      incorrectCount: w.incorrectCount,
      totalAttempts: w.totalAttempts,
      accuracy: w.accuracy,
      masteredAt: w.masteredAt,
      permanentlyMastered: w.permanentlyMastered ?? false,
      wantToLearn: w.wantToLearn,
      lastReviewedAt: w.lastReviewedAt,
    })),
    decks: decks.map((d) => ({
      deckSlug: d.deckSlug,
      deckTitle: d.deckTitle,
      quizAttempts: d.quizAttempts,
      quizCorrectSum: d.quizCorrectSum,
      bestAccuracy: d.bestAccuracy,
      wordsMastered: d.wordsMastered,
      totalWords: d.totalWords,
    })),
  }
}

/** Staff: words ranked by error rate (most problematic first). */
export async function getVocabWordStats(orgId, { deckSlug, limit = 50 } = {}) {
  const match = { orgId }
  if (deckSlug) match.deckSlug = deckSlug

  const rows = await StudentWordProgress.aggregate([
    { $match: match },
    {
      $group: {
        _id: { term: "$term", deckSlug: "$deckSlug" },
        totalAttempts: { $sum: "$totalAttempts" },
        correctCount: { $sum: "$correctCount" },
        incorrectCount: { $sum: "$incorrectCount" },
        studentCount: { $sum: 1 },
      },
    },
    {
      $match: { totalAttempts: { $gte: 3 } },
    },
    {
      $addFields: {
        errorRate: {
          $cond: [
            { $gt: ["$totalAttempts", 0] },
            { $divide: ["$incorrectCount", "$totalAttempts"] },
            0,
          ],
        },
      },
    },
    { $sort: { errorRate: -1, totalAttempts: -1 } },
    { $limit: limit },
  ])

  return rows.map((r) => ({
    term: r._id.term,
    deckSlug: r._id.deckSlug,
    totalAttempts: r.totalAttempts,
    correctCount: r.correctCount,
    incorrectCount: r.incorrectCount,
    errorRate: Math.round(r.errorRate * 100),
    studentCount: r.studentCount,
  }))
}

/** Staff: deck engagement stats. */
export async function getVocabDeckStats(orgId, { limit = 50 } = {}) {
  const rows = await StudentDeckProgress.aggregate([
    { $match: { orgId } },
    {
      $group: {
        _id: "$deckSlug",
        deckTitle: { $first: "$deckTitle" },
        studentCount: { $sum: 1 },
        totalQuizAttempts: { $sum: "$quizAttempts" },
        totalCorrect: { $sum: "$quizCorrectSum" },
        avgBestAccuracy: { $avg: "$bestAccuracy" },
        totalWordsMastered: { $sum: "$wordsMastered" },
      },
    },
    { $sort: { totalQuizAttempts: -1 } },
    { $limit: limit },
  ])

  return rows.map((r) => ({
    deckSlug: r._id,
    deckTitle: r.deckTitle,
    studentCount: r.studentCount,
    quizAttempts: r.totalQuizAttempts,
    totalCorrect: r.totalCorrect,
    avgBestAccuracy: r.avgBestAccuracy != null ? Math.round(r.avgBestAccuracy) : null,
    wordsMastered: r.totalWordsMastered,
  }))
}

/** Count mastered words for gamification points. */
export async function countMasteredWords(studentId) {
  return StudentWordProgress.countDocuments({ studentId, masteredAt: { $ne: null } })
}

/** Aggregate learn points from vocabulary sources (with legacy StudentActivity fallback). */
export async function aggregateLearnPoints(studentId) {
  const [reviewAgg, masteredCount, quizAgg, deckCompletions, legacyQuiz] = await Promise.all([
    WordAnswerEvent.aggregate([
      { $match: { studentId, correct: true, source: "review" } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    countMasteredWords(studentId),
    WordAnswerEvent.aggregate([
      { $match: { studentId, source: "quiz" } },
      { $group: { _id: null, correctCount: { $sum: { $cond: ["$correct", 1, 0] } } } },
    ]),
    StudentDeckProgress.aggregate([
      { $match: { studentId, quizAttempts: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: "$quizAttempts" } } },
    ]),
    StudentActivity.aggregate([
      { $match: { studentId, eventType: "vocab.quiz_complete" } },
      {
        $group: {
          _id: null,
          correctSum: { $sum: { $ifNull: ["$correctCount", 0] } },
          attempts: { $sum: 1 },
        },
      },
    ]),
  ])

  const reviewCorrect = reviewAgg[0]?.count ?? 0
  let quizCorrect = quizAgg[0]?.correctCount ?? 0
  let deckCompleteBonus = deckCompletions[0]?.total ?? 0

  if (quizCorrect === 0) {
    quizCorrect = legacyQuiz[0]?.correctSum ?? 0
  }
  if (deckCompleteBonus === 0) {
    deckCompleteBonus = legacyQuiz[0]?.attempts ?? 0
  }

  return {
    reviewCorrect,
    quizCorrect,
    masteredCount,
    deckCompleteBonus,
  }
}

/** Batch learn points for leaderboard (multiple students). */
export async function aggregateLearnPointsBatch(studentIds) {
  const [reviewAgg, masteredAgg, quizEventAgg, deckAgg, legacyQuiz] = await Promise.all([
    WordAnswerEvent.aggregate([
      { $match: { studentId: { $in: studentIds }, correct: true, source: "review" } },
      { $group: { _id: "$studentId", count: { $sum: 1 } } },
    ]),
    StudentWordProgress.aggregate([
      { $match: { studentId: { $in: studentIds }, masteredAt: { $ne: null } } },
      { $group: { _id: "$studentId", count: { $sum: 1 } } },
    ]),
    WordAnswerEvent.aggregate([
      { $match: { studentId: { $in: studentIds }, source: "quiz", correct: true } },
      { $group: { _id: "$studentId", count: { $sum: 1 } } },
    ]),
    StudentDeckProgress.aggregate([
      { $match: { studentId: { $in: studentIds }, quizAttempts: { $gt: 0 } } },
      { $group: { _id: "$studentId", deckAttempts: { $sum: "$quizAttempts" } } },
    ]),
    StudentActivity.aggregate([
      { $match: { studentId: { $in: studentIds }, eventType: "vocab.quiz_complete" } },
      {
        $group: {
          _id: "$studentId",
          correctSum: { $sum: { $ifNull: ["$correctCount", 0] } },
          attempts: { $sum: 1 },
        },
      },
    ]),
  ])

  const map = new Map(
    studentIds.map((id) => [id, { reviewCorrect: 0, quizCorrect: 0, masteredCount: 0, deckCompleteBonus: 0 }]),
  )

  for (const row of reviewAgg) {
    const cur = map.get(row._id)
    if (cur) cur.reviewCorrect = row.count
  }
  for (const row of masteredAgg) {
    const cur = map.get(row._id)
    if (cur) cur.masteredCount = row.count
  }
  for (const row of quizEventAgg) {
    const cur = map.get(row._id)
    if (cur) cur.quizCorrect = row.count
  }
  for (const row of deckAgg) {
    const cur = map.get(row._id)
    if (cur) cur.deckCompleteBonus = row.deckAttempts
  }
  for (const row of legacyQuiz) {
    const cur = map.get(row._id)
    if (!cur) continue
    if (cur.quizCorrect === 0) cur.quizCorrect = row.correctSum
    if (cur.deckCompleteBonus === 0) cur.deckCompleteBonus = row.attempts
  }

  return map
}
