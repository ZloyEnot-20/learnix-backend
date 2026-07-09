import { Submission } from "../models/Submission.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { WordAnswerEvent } from "../models/WordAnswerEvent.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { ControlWork } from "../models/ControlWork.js"
import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { User } from "../models/User.js"
import { StudentLanguageProfile } from "../models/StudentLanguageProfile.js"
import { isCheatingSubmission } from "./submission.service.js"
import { maybeSaveProfileSnapshot } from "./languageProfileSnapshot.service.js"
import { buildRecommendations } from "./studentRecommendations.service.js"
import {
  MEASURED_SKILLS,
  GRAMMAR_TOPIC_COUNT,
  GRAMMAR_TOPIC_LEVELS,
  MASTERY_ACCURACY,
  MASTERY_CONFIDENCE,
  MASTERY_MIN_QUESTIONS,
  NEEDS_REVIEW_ACCURACY,
  NEEDS_REVIEW_STALE_DAYS,
  MIN_QUESTIONS_FOR_TOPIC,
  confidenceFromQuestions,
  speakingConfidenceFromAssessments,
  recencyWeight,
  grammarTopicLevel,
  vocabDeckLevel,
  topicLevelWeight,
} from "../config/language-profile.js"

const VOCAB_PREFIX = "vocab:"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
}

/** @typedef {{ correct: number, total: number, at: Date, weight: number }} WeightedAttempt */

/**
 * @typedef {object} TopicAccumulator
 * @property {string} slug
 * @property {string} title
 * @property {number} learnixLevel
 * @property {WeightedAttempt[]} attempts
 */

function createTopicAccumulator(slug, title, learnixLevel) {
  return { slug, title: title ?? slug, learnixLevel, attempts: [] }
}

function addAttempt(acc, correct, total, at, difficultyWeight = 1) {
  if (!total || total <= 0) return
  acc.attempts.push({
    correct: correct ?? 0,
    total,
    at: at ? new Date(at) : new Date(),
    weight: difficultyWeight,
  })
}

function computeTopicStats(acc, now = new Date()) {
  const { slug, title, learnixLevel, attempts } = acc
  if (!attempts.length) return null

  let correctSum = 0
  let totalSum = 0
  let weightedCorrect = 0
  let weightedTotal = 0
  let firstAt = null
  let lastAt = null
  let lastSuccessAt = null

  for (const a of attempts) {
    const rw = recencyWeight(a.at, now) * a.weight
    correctSum += a.correct
    totalSum += a.total
    weightedCorrect += a.correct * rw
    weightedTotal += a.total * rw
    if (!firstAt || a.at < firstAt) firstAt = a.at
    if (!lastAt || a.at > lastAt) lastAt = a.at
    const attemptAcc = a.total > 0 ? a.correct / a.total : 0
    if (attemptAcc >= MASTERY_ACCURACY / 100) {
      if (!lastSuccessAt || a.at > lastSuccessAt) lastSuccessAt = a.at
    }
  }

  const accuracy = pct(correctSum, totalSum)
  const weightedAccuracy = pct(weightedCorrect, weightedTotal)
  const confidence = confidenceFromQuestions(totalSum)
  const mastered =
    weightedAccuracy >= MASTERY_ACCURACY &&
    confidence >= MASTERY_CONFIDENCE &&
    totalSum >= MASTERY_MIN_QUESTIONS

  const daysSinceSuccess = lastSuccessAt
    ? (now.getTime() - lastSuccessAt.getTime()) / (1000 * 60 * 60 * 24)
    : Infinity

  const needsReview =
    (weightedAccuracy < NEEDS_REVIEW_ACCURACY && totalSum >= MIN_QUESTIONS_FOR_TOPIC) ||
    (mastered && daysSinceSuccess > NEEDS_REVIEW_STALE_DAYS) ||
    (!mastered && lastAt && (now.getTime() - lastAt.getTime()) / (1000 * 60 * 60 * 24) > NEEDS_REVIEW_STALE_DAYS && totalSum >= MIN_QUESTIONS_FOR_TOPIC)

  return {
    slug,
    title,
    attemptedQuestions: totalSum,
    correctAnswers: correctSum,
    totalAttempts: attempts.length,
    firstAttemptAt: firstAt,
    lastAttemptAt: lastAt,
    lastSuccessAt,
    accuracy,
    weightedAccuracy,
    confidence,
    learnixLevel,
    mastered,
    needsReview,
  }
}

function computeSkillScore(topicStats) {
  const eligible = topicStats.filter(
    (t) => t.attemptedQuestions >= MIN_QUESTIONS_FOR_TOPIC,
  )
  if (!eligible.length) {
    return { score: 0, confidence: 0, level: 1, hasData: false }
  }

  let weightedSum = 0
  let maxSum = 0
  let confSum = 0
  let masteredCount = 0

  for (const t of eligible) {
    const w = topicLevelWeight(t.learnixLevel)
    const c = t.confidence
    weightedSum += (t.weightedAccuracy / 100) * w * c
    maxSum += w * c
    confSum += c
    if (t.mastered) masteredCount += 1
  }

  const rawRatio = maxSum > 0 ? weightedSum / maxSum : 0
  const avgConfidence = confSum / eligible.length
  const masteryBonus = 0.7 + 0.3 * (masteredCount / Math.max(1, eligible.length))
  const score = Math.round(
    Math.min(1000, rawRatio * 1000 * masteryBonus * avgConfidence),
  )
  const confidence = Math.min(1, avgConfidence)
  const level = scoreToLearnixLevel(score, eligible.length, masteredCount)

  return { score, confidence, level, hasData: true }
}

function scoreToLearnixLevel(score, topicsAttempted, masteredCount) {
  const base = Math.max(1, Math.min(9, Math.round((score / 1000) * 9)))
  if (topicsAttempted < 3) return Math.min(base, 2)
  if (topicsAttempted < 6) return Math.min(base, 4)
  if (masteredCount < 2) return Math.min(base, 5)
  if (masteredCount < 5) return Math.min(base, 7)
  return base
}

function computeOverallSkillScores(skillProfiles) {
  const active = MEASURED_SKILLS.filter(
    (s) => skillProfiles[s]?.hasData && (skillProfiles[s].confidence ?? 0) > 0,
  )
  if (!active.length) {
    return { score: 0, level: 1, confidence: 0 }
  }

  let scoreSum = 0
  let confSum = 0
  for (const skill of active) {
    const p = skillProfiles[skill]
    scoreSum += p.score * p.confidence
    confSum += p.confidence
  }

  const score = confSum > 0 ? Math.round(scoreSum / confSum) : 0
  const confidence = Math.min(1, confSum / active.length)
  const level = scoreToLearnixLevel(
    score,
    active.reduce((a, s) => a + (skillProfiles[s].topics?.length ?? 0), 0),
    active.reduce(
      (a, s) => a + (skillProfiles[s].topics?.filter((t) => t.mastered).length ?? 0),
      0,
    ),
  )

  return { score, level, confidence }
}

/** Count speaking homework with teacher grades (approved assessments). */
export function countApprovedSpeakingAssessments(submissions) {
  let count = 0
  for (const sub of submissions) {
    if (sub.subject !== "speaking") continue
    if (!["graded", "submitted"].includes(sub.status)) continue
    const mistakes = sub.attempt?.mistakes ?? []
    const hasRubric = mistakes.some(
      (m) =>
        m.grammarScore != null ||
        m.vocabularyScore != null ||
        m.fluencyScore != null ||
        m.pronunciationScore != null,
    )
    const hasLegacyGrade = typeof sub.score === "number" || mistakes.some((m) => m.score != null)
    if (sub.status === "graded" && (hasRubric || hasLegacyGrade)) {
      count += 1
    }
  }
  return count
}

/**
 * Percent of catalogue grammar topics mastered at each Learnix level (1–9).
 * Vocabulary decks attempted at a level contribute to the denominator when present.
 */
export function computeLevelCoverage(grammarTopicStats, vocabTopicStats = []) {
  const masteredGrammar = new Set(
    grammarTopicStats.filter((t) => t.mastered).map((t) => t.slug),
  )
  const masteredVocab = new Set(
    vocabTopicStats.filter((t) => t.mastered).map((t) => t.slug),
  )

  const coverage = {}
  for (let level = 1; level <= 9; level++) {
    const grammarAtLevel = Object.entries(GRAMMAR_TOPIC_LEVELS)
      .filter(([, lv]) => lv === level)
      .map(([slug]) => slug)

    const vocabAtLevel = vocabTopicStats.filter((t) => t.learnixLevel === level)
    const vocabSlugsAtLevel = vocabAtLevel.map((t) => t.slug)

    const grammarMastered = grammarAtLevel.filter((s) => masteredGrammar.has(s)).length
    const vocabMastered = vocabSlugsAtLevel.filter((s) => masteredVocab.has(s)).length

    const totalCatalogue = grammarAtLevel.length + vocabSlugsAtLevel.length
    const totalMastered = grammarMastered + vocabMastered

    if (totalCatalogue > 0) {
      coverage[String(level)] = Math.round((totalMastered / totalCatalogue) * 100)
    } else if (grammarAtLevel.length > 0) {
      coverage[String(level)] = Math.round((grammarMastered / grammarAtLevel.length) * 100)
    } else {
      coverage[String(level)] = 0
    }
  }
  return coverage
}

function computeSpeakingDimensions(submissions, now) {
  const dims = { grammar: [], vocabulary: [], fluency: [], pronunciation: [] }

  for (const sub of submissions) {
    if (sub.subject !== "speaking") continue
    for (const m of sub.attempt?.mistakes ?? []) {
      const at = sub.submittedAt ?? sub.assignedAt ?? now
      if (m.grammarScore != null) dims.grammar.push({ v: m.grammarScore, at })
      if (m.vocabularyScore != null) dims.vocabulary.push({ v: m.vocabularyScore, at })
      if (m.fluencyScore != null) dims.fluency.push({ v: m.fluencyScore, at })
      if (m.pronunciationScore != null) dims.pronunciation.push({ v: m.pronunciationScore, at })
      if (
        m.grammarScore == null &&
        m.vocabularyScore == null &&
        m.fluencyScore == null &&
        m.pronunciationScore == null &&
        typeof m.score === "number"
      ) {
        const legacy = (m.score / 9) * 10
        dims.grammar.push({ v: legacy, at })
        dims.vocabulary.push({ v: legacy, at })
        dims.fluency.push({ v: legacy, at })
        dims.pronunciation.push({ v: legacy, at })
      }
    }
    if (typeof sub.score === "number" && !(sub.attempt?.mistakes ?? []).some((m) => m.grammarScore != null)) {
      const legacy = (sub.score / 9) * 10
      const at = sub.submittedAt ?? now
      for (const key of Object.keys(dims)) {
        dims[key].push({ v: legacy, at })
      }
    }
  }

  const result = {}
  for (const [key, entries] of Object.entries(dims)) {
    if (!entries.length) {
      result[key] = 0
      continue
    }
    let sum = 0
    let wSum = 0
    for (const e of entries) {
      const w = recencyWeight(e.at, now)
      sum += e.v * w
      wSum += w
    }
    const avg = wSum > 0 ? sum / wSum : 0
    result[key] = Math.round((avg / 10) * 1000)
  }
  return result
}

function speakingScoreFromDimensions(dimensions, topicStats, submissions) {
  const dimValues = Object.values(dimensions).filter((v) => v > 0)
  if (dimValues.length) {
    return Math.round(dimValues.reduce((a, b) => a + b, 0) / dimValues.length)
  }
  const skill = computeSkillScore(topicStats)
  return skill.score
}

async function loadGrammarTopicMaps() {
  const exercises = await Exercise.find({ category: "grammar" })
    .select("slug topic title level")
    .lean()
  const slugToTopic = new Map(exercises.map((e) => [e.slug, e]))
  return slugToTopic
}

async function loadVocabDeckMap() {
  const decks = await VocabDeck.find().select("slug title level difficulty topic").lean()
  return new Map(decks.map((d) => [d.slug, d]))
}

/**
 * Collect raw topic accumulators from all measured data sources.
 */
async function collectTopicData(studentId) {
  /** @type {Map<string, TopicAccumulator>} */
  const grammarTopics = new Map()
  /** @type {Map<string, TopicAccumulator>} */
  const vocabTopics = new Map()
  /** @type {Map<string, TopicAccumulator>} */
  const speakingTopics = new Map()

  const [subs, events, activities, wordEvents, cwSubs, exerciseMap, deckMap] =
    await Promise.all([
      Submission.find({ studentId }).lean(),
      ExerciseEvent.find({ studentId }).lean(),
      StudentActivity.find({
        studentId,
        category: { $in: ["grammar", "vocabulary"] },
      })
        .sort({ at: -1 })
        .limit(2000)
        .lean(),
      WordAnswerEvent.find({ studentId }).sort({ at: -1 }).limit(5000).lean(),
      ControlWorkSubmission.find({ studentId }).lean(),
      loadGrammarTopicMaps(),
      loadVocabDeckMap(),
    ])

  const cwIds = [...new Set(cwSubs.map((s) => s.controlWorkId))]
  const controlWorks = cwIds.length
    ? await ControlWork.find({ _id: { $in: cwIds } }).select("_id steps").lean()
    : []
  const cwById = new Map(controlWorks.map((c) => [c._id, c]))

  function ensureGrammar(slug, title) {
    if (!grammarTopics.has(slug)) {
      grammarTopics.set(
        slug,
        createTopicAccumulator(slug, title, grammarTopicLevel(slug)),
      )
    }
    return grammarTopics.get(slug)
  }

  function ensureVocab(slug, title, level) {
    if (!vocabTopics.has(slug)) {
      vocabTopics.set(
        slug,
        createTopicAccumulator(slug, title, level ?? vocabDeckLevel("A1")),
      )
    }
    return vocabTopics.get(slug)
  }

  function ensureSpeaking(slug, title) {
    if (!speakingTopics.has(slug)) {
      speakingTopics.set(slug, createTopicAccumulator(slug, title, 5))
    }
    return speakingTopics.get(slug)
  }

  for (const sub of subs) {
    if (!sub.attempt || isCheatingSubmission(sub)) continue
    if (!["submitted", "graded"].includes(sub.status)) continue

    const at = sub.submittedAt ?? sub.assignedAt
    const correct = sub.attempt.correctCount ?? 0
    const total = sub.attempt.totalQuestions ?? 0

    if (sub.subject === "grammar") {
      const topic =
        sub.grammarTopic ??
        exerciseMap.get(sub.topic)?.topic ??
        sub.topic
      if (!topic) continue
      const meta = exerciseMap.get(sub.topic)
      const acc = ensureGrammar(topic, meta?.title ?? topic)
      const lw = topicLevelWeight(sub.grammarLevel ?? grammarTopicLevel(topic))
      addAttempt(acc, correct, total, at, lw)
    }

    if (sub.subject === "vocabulary") {
      const deckSlug = sub.vocabularyTopic ?? sub.topic?.replace(VOCAB_PREFIX, "") ?? sub.topic
      const deck = deckMap.get(deckSlug)
      const acc = ensureVocab(
        deckSlug,
        deck?.title ?? deckSlug,
        sub.vocabularyLevel ?? (deck ? vocabDeckLevel(deck.level, deck.difficulty) : 3),
      )
      const lw = topicLevelWeight(acc.learnixLevel)
      addAttempt(acc, correct, total, at, lw)
    }

    if (sub.subject === "speaking") {
      const slug = sub.topic ?? "speaking"
      const acc = ensureSpeaking(slug, sub.homeworkTitle ?? slug)
      const answered = sub.attempt.answeredCount ?? correct
      addAttempt(acc, answered, total, at, 1.5)
    }
  }

  for (const e of events) {
    const acc = ensureGrammar(e.topic, e.title)
    const lw = topicLevelWeight(grammarTopicLevel(e.topic))
    addAttempt(acc, e.correctCount, e.totalQuestions, e.at, lw)
  }

  for (const a of activities) {
    if (a.correctCount == null && a.totalQuestions == null) continue
    const at = a.at
    if (a.category === "grammar" || a.subject === "grammar") {
      const topic = a.metadata?.topic ?? a.materialSlug
      if (!topic) continue
      const acc = ensureGrammar(topic, a.materialTitle ?? topic)
      addAttempt(acc, a.correctCount, a.totalQuestions, at, topicLevelWeight(grammarTopicLevel(topic)))
    }
    if (a.category === "vocabulary" || a.subject === "vocabulary") {
      const slug = a.materialSlug ?? "unknown"
      const deck = deckMap.get(slug)
      const acc = ensureVocab(
        slug,
        a.materialTitle ?? deck?.title ?? slug,
        deck ? vocabDeckLevel(deck.level, deck.difficulty) : 3,
      )
      addAttempt(acc, a.correctCount, a.totalQuestions, at, topicLevelWeight(acc.learnixLevel))
    }
  }

  for (const w of wordEvents) {
    const deck = deckMap.get(w.deckSlug)
    const acc = ensureVocab(
      w.deckSlug,
      deck?.title ?? w.deckSlug,
      deck ? vocabDeckLevel(deck.level, deck.difficulty) : 3,
    )
    addAttempt(acc, w.correct ? 1 : 0, 1, w.at, topicLevelWeight(acc.learnixLevel))
  }

  for (const cws of cwSubs) {
    if (!["submitted", "graded"].includes(cws.status)) continue
    const cw = cwById.get(cws.controlWorkId)
    if (!cw?.steps) continue
    for (const stepResult of cws.stepResults ?? []) {
      if (stepResult.status !== "completed" || !stepResult.attempt) continue
      const step = cw.steps[stepResult.stepIndex]
      if (!step) continue
      const at = stepResult.submittedAt ?? cws.submittedAt
      const { correctCount, totalQuestions } = stepResult.attempt
      if (step.subject === "grammar" && step.exerciseSlug) {
        const ex = exerciseMap.get(step.exerciseSlug)
        const topic = ex?.topic ?? step.topic ?? step.exerciseSlug
        const acc = ensureGrammar(topic, ex?.title ?? topic)
        addAttempt(acc, correctCount, totalQuestions, at, topicLevelWeight(grammarTopicLevel(topic)))
      }
      if (step.subject === "vocabulary") {
        const deckSlug = step.deckSlug?.replace(VOCAB_PREFIX, "") ?? step.deckSlug
        const deck = deckMap.get(deckSlug)
        const acc = ensureVocab(
          deckSlug,
          deck?.title ?? deckSlug,
          deck ? vocabDeckLevel(deck.level, deck.difficulty) : 3,
        )
        addAttempt(acc, correctCount, totalQuestions, at, topicLevelWeight(acc.learnixLevel))
      }
      if (step.subject === "speaking") {
        const acc = ensureSpeaking(step.exerciseSlug ?? "speaking", step.title)
        addAttempt(acc, stepResult.attempt.answeredCount ?? correctCount, totalQuestions, at, 1.5)
      }
    }
  }

  return {
    grammarTopics,
    vocabTopics,
    speakingTopics,
    speakingSubmissions: subs.filter((s) => s.subject === "speaking"),
  }
}

function buildSkillProfile(topicMap, speakingDimensions = null) {
  const topicStats = [...topicMap.values()]
    .map((acc) => computeTopicStats(acc))
    .filter(Boolean)
    .sort((a, b) => b.weightedAccuracy - a.weightedAccuracy)

  const { score, confidence, level, hasData } = computeSkillScore(topicStats)
  const profile = {
    score,
    confidence,
    level,
    topics: topicStats,
    hasData,
    dimensions: speakingDimensions ?? undefined,
  }
  if (speakingDimensions) {
    profile.dimensions = speakingDimensions
  }
  return profile
}

/**
 * Full recompute and persist student language profile.
 * @param {string} studentId
 */
export async function recomputeStudentLanguageProfile(studentId) {
  const student = await User.findById(studentId).select("_id orgId type").lean()
  if (!student || student.type !== "student") return null

  let orgId = student.orgId
  if (!orgId) {
    const sub = await Submission.findOne({ studentId }).select("orgId").lean()
    orgId = sub?.orgId ?? null
  }
  if (!orgId) {
    const act = await StudentActivity.findOne({ studentId }).select("orgId").lean()
    orgId = act?.orgId ?? null
  }

  const now = new Date()
  const { grammarTopics, vocabTopics, speakingTopics, speakingSubmissions } =
    await collectTopicData(studentId)

  const speakingDimensions = computeSpeakingDimensions(speakingSubmissions, now)
  const approvedSpeakingCount = countApprovedSpeakingAssessments(speakingSubmissions)
  const speakingConf = speakingConfidenceFromAssessments(approvedSpeakingCount)

  const grammar = buildSkillProfile(grammarTopics)
  const vocabulary = buildSkillProfile(vocabTopics)
  const speakingTopicsStats = [...speakingTopics.values()]
    .map((acc) => computeTopicStats(acc))
    .filter(Boolean)

  const speakingBase = buildSkillProfile(speakingTopics)
  const speaking = {
    ...speakingBase,
    score: speakingScoreFromDimensions(speakingDimensions, speakingTopicsStats, speakingSubmissions),
    dimensions: speakingDimensions,
    hasData:
      speakingBase.hasData ||
      approvedSpeakingCount > 0 ||
      Object.values(speakingDimensions).some((v) => v > 0),
  }

  if (speaking.hasData) {
    if (speaking.score > 0) {
      speaking.level = scoreToLearnixLevel(
        speaking.score,
        speaking.topics.length,
        speaking.topics.filter((t) => t.mastered).length,
      )
    }
    speaking.confidence = speakingConf
  }

  const skillProfiles = { grammar, vocabulary, speaking }
  const overall = computeOverallSkillScores(skillProfiles)

  const allTopics = [
    ...grammar.topics,
    ...vocabulary.topics,
    ...speaking.topics,
  ]
  const masteredTopics = allTopics.filter((t) => t.mastered).map((t) => t.slug)
  const needsReviewTopics = allTopics.filter((t) => t.needsReview).map((t) => t.slug)
  const levelCoverage = computeLevelCoverage(grammar.topics, vocabulary.topics)

  const doc = {
    _id: studentId,
    studentId,
    orgId: orgId ?? "unknown",
    grammar,
    vocabulary,
    speaking,
    reading: { hasData: false, score: 0, confidence: 0, level: 1, topics: [] },
    listening: { hasData: false, score: 0, confidence: 0, level: 1, topics: [] },
    writing: { hasData: false, score: 0, confidence: 0, level: 1, topics: [] },
    overall,
    coverage: {
      attemptedTopics: allTopics.length,
      masteredTopics: masteredTopics.length,
      totalTopics: GRAMMAR_TOPIC_COUNT + vocabTopics.size,
      needsReviewTopics: needsReviewTopics.length,
    },
    masteredTopics,
    needsReviewTopics,
    levelCoverage,
    recommendations: [],
    lastComputedAt: now,
    version: 2,
  }

  doc.recommendations = buildRecommendations(doc)

  await StudentLanguageProfile.findOneAndUpdate({ studentId }, doc, {
    upsert: true,
    new: true,
  })

  await maybeSaveProfileSnapshot(studentId, orgId ?? "unknown", doc).catch((err) => {
    console.error("[languageProfile] snapshot save failed", err)
  })

  return doc
}

/**
 * Read persisted profile. Recomputes only when missing or force=true.
 * Recommendations and snapshots are not regenerated on dashboard page load.
 */
export async function getStudentLanguageProfile(studentId, opts = {}) {
  const existing = await StudentLanguageProfile.findOne({ studentId }).lean()

  if (!existing || opts.force) {
    return recomputeStudentLanguageProfile(studentId)
  }

  return {
    ...existing,
    levelCoverage: existing.levelCoverage ?? {},
  }
}

/** Batch summaries for staff list (compact). */
export async function buildLanguageProfileSummaries(students) {
  return Promise.all(
    students.map(async (student) => {
      const id = student._id ?? student.id
      const profile = await StudentLanguageProfile.findOne({ studentId: id }).lean()
      return {
        studentId: id,
        overallScore: profile?.overall?.score ?? null,
        learnixLevel: profile?.overall?.level ?? null,
        confidence: profile?.overall?.confidence ?? null,
        grammarScore: profile?.grammar?.score ?? null,
        vocabularyScore: profile?.vocabulary?.score ?? null,
        speakingScore: profile?.speaking?.score ?? null,
        hasData: !!(profile?.grammar?.hasData || profile?.vocabulary?.hasData || profile?.speaking?.hasData),
      }
    }),
  )
}

/** Exported for unit tests. */
export const _internal = {
  computeTopicStats,
  computeSkillScore,
  computeOverallSkillScores,
  computeLevelCoverage,
  countApprovedSpeakingAssessments,
  confidenceFromQuestions,
  speakingConfidenceFromAssessments,
  recencyWeight,
  scoreToLearnixLevel,
}
