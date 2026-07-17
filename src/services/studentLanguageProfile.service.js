import { Submission } from "../models/Submission.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { WordAnswerEvent } from "../models/WordAnswerEvent.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { ControlWork } from "../models/ControlWork.js"
import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { StudentDeckProgress } from "../models/StudentDeckProgress.js"
import { User } from "../models/User.js"
import { StudentLanguageProfile } from "../models/StudentLanguageProfile.js"
import { TestResult } from "../models/TestResult.js"
import { Homework } from "../models/Homework.js"
import { isCheatingSubmission } from "./submission.service.js"
import { maybeSaveProfileSnapshot } from "./languageProfileSnapshot.service.js"
import { buildRecommendations } from "./studentRecommendations.service.js"
import {
  MEASURED_SKILLS,
  GRAMMAR_TOPIC_COUNT,
  GRAMMAR_TOPIC_LEVELS,
  buildLevelCatalogue,
  MASTERY_ACCURACY,
  MASTERY_CONFIDENCE,
  MASTERY_MIN_QUESTIONS,
  NEEDS_REVIEW_ACCURACY,
  NEEDS_REVIEW_STALE_DAYS,
  MIN_QUESTIONS_FOR_TOPIC,
  WORD_EVENT_QUESTION_WEIGHT,
  VOCAB_DECK_MASTERY_PCT,
  confidenceFromQuestions,
  speakingConfidenceFromAssessments,
  recencyWeight,
  grammarTopicLevel,
  vocabDeckLevel,
  topicLevelWeight,
} from "../config/language-profile.js"
import {
  cambridgeBandFromAttempt,
  ieltsBandToLearnixScore,
  ieltsSkillConfidenceFromAttempts,
} from "../config/ielts-band-tables.js"
import {
  computeAllTopicMasteries,
  persistTopicMasteries,
  buildIeltsLanguageProfile,
  enrichTopicsWithMastery,
} from "./ieltsLanguageProfile.service.js"

const VOCAB_PREFIX = "vocab:"
const PODCAST_SLUG_PREFIX = "podcast:"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
}

/** @typedef {{ correct: number, total: number, at: Date, weight: number, source?: string }} WeightedAttempt */

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

function addAttempt(acc, correct, total, at, difficultyWeight = 1, source = undefined) {
  if (!total || total <= 0) return
  acc.attempts.push({
    correct: correct ?? 0,
    total,
    at: at ? new Date(at) : new Date(),
    weight: difficultyWeight,
    ...(source ? { source } : {}),
  })
}

function computeSkillScoreDebug(topicStats, levelCoverage = {}) {
  const eligible = countEligibleTopics(topicStats)
  if (!eligible.length) {
    return {
      profile: { score: 0, confidence: 0, level: 1, hasData: false },
      debug: {
        rawScore: 0,
        avgConfidence: 0,
        breadthFactor: 0,
        masteryFactor: 0,
        masteryBonus: 0,
        eligibleTopics: 0,
        masteredTopics: 0,
        finalScore: 0,
        level: 1,
      },
    }
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
  const rawScore = Math.min(1000, rawRatio * 1000 * masteryBonus * avgConfidence)
  const breadthFactor = Math.min(1, Math.sqrt(eligible.length / 8))
  const masteryFactor = Math.min(1, 0.55 + 0.45 * Math.min(1, masteredCount / 8))
  const finalScore = applyBreadthPenalty(Math.round(rawScore), eligible.length, masteredCount)
  const confidence = Math.min(1, avgConfidence)
  const level = deriveLearnixLevel(finalScore, eligible.length, masteredCount, levelCoverage)

  return {
    profile: { score: finalScore, confidence, level, hasData: true },
    debug: {
      rawScore: Math.round(rawScore),
      avgConfidence,
      breadthFactor,
      masteryFactor,
      masteryBonus,
      eligibleTopics: eligible.length,
      masteredTopics: masteredCount,
      finalScore,
      level,
    },
  }
}

function coveragePenaltyDebug(score, levelCoverage, attemptedTopics, totalTopics) {
  if (score <= 0) {
    return { finalScore: 0, breadthPenalty: 0, levelPenalty: 0 }
  }
  const catalogueBreadth = totalTopics > 0 ? attemptedTopics / totalTopics : 0
  const breadthPenalty = Math.min(1, Math.sqrt(Math.max(0, catalogueBreadth) * 6))

  let levelProgress = 0
  for (let l = 1; l <= 9; l++) {
    levelProgress += (levelCoverage[String(l)] ?? 0) / 100
  }
  const levelPenalty = Math.min(1, 0.35 + 0.65 * (levelProgress / 9))
  const finalScore = Math.round(score * breadthPenalty * levelPenalty)
  return { finalScore, breadthPenalty, levelPenalty }
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

function applyVocabDeckMastery(topicStats, deckProgressBySlug) {
  if (!deckProgressBySlug) return topicStats
  const pctReq = VOCAB_DECK_MASTERY_PCT ?? 80
  return topicStats.map((t) => {
    const dp = deckProgressBySlug.get(t.slug)
    if (!dp) return t
    const totalWords = dp.totalWords ?? 0
    const wordsMastered = dp.wordsMastered ?? 0
    if (!totalWords || totalWords <= 0) {
      // Without deck size, never auto-mark as mastered from quizzes.
      return { ...t, mastered: false }
    }
    const pct = (wordsMastered / totalWords) * 100
    const mastered = pct >= pctReq
    return { ...t, mastered }
  })
}

/** Penalize inflated scores from narrow topic breadth (few decks practiced well). */
function applyBreadthPenalty(score, eligibleCount, masteredCount) {
  const breadthFactor = Math.min(1, Math.sqrt(eligibleCount / 8))
  const masteryFactor = Math.min(1, 0.55 + 0.45 * Math.min(1, masteredCount / 8))
  return Math.round(score * breadthFactor * masteryFactor)
}

/** Reduce score when catalogue / level coverage is still shallow. */
function adjustScoreForCoverage(score, levelCoverage, attemptedTopics, totalTopics) {
  if (score <= 0) return 0
  const catalogueBreadth = totalTopics > 0 ? attemptedTopics / totalTopics : 0
  const breadthPenalty = Math.min(1, Math.sqrt(Math.max(0, catalogueBreadth) * 6))

  let levelProgress = 0
  for (let l = 1; l <= 9; l++) {
    levelProgress += (levelCoverage[String(l)] ?? 0) / 100
  }
  const levelPenalty = Math.min(1, 0.35 + 0.65 * (levelProgress / 9))

  return Math.round(score * breadthPenalty * levelPenalty)
}

function countEligibleTopics(topicStats) {
  return topicStats.filter((t) => t.attemptedQuestions >= MIN_QUESTIONS_FOR_TOPIC)
}

function computeSkillScore(topicStats, levelCoverage = {}) {
  const eligible = countEligibleTopics(topicStats)
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
  const rawScore = Math.min(1000, rawRatio * 1000 * masteryBonus * avgConfidence)
  const score = applyBreadthPenalty(Math.round(rawScore), eligible.length, masteredCount)
  const confidence = Math.min(1, avgConfidence)
  const level = deriveLearnixLevel(score, eligible.length, masteredCount, levelCoverage)

  return { score, confidence, level, hasData: true }
}

/** Highest level with at least minPct catalogue mastery (sequential — no skipping). */
function maxLevelFromCoverage(levelCoverage, minPct = 25) {
  let maxLevel = 1
  for (let l = 1; l <= 9; l++) {
    const pct = levelCoverage[String(l)] ?? 0
    if (pct >= minPct) maxLevel = l
    else break
  }
  return maxLevel
}

function deriveLearnixLevel(score, topicsAttempted, masteredCount, levelCoverage = {}) {
  const base = Math.max(1, Math.min(9, Math.round((score / 1000) * 9)))
  let level = base
  if (topicsAttempted < 3) level = Math.min(level, 2)
  if (topicsAttempted < 6) level = Math.min(level, 4)
  if (masteredCount < 2) level = Math.min(level, 5)
  if (masteredCount < 5) level = Math.min(level, 7)
  level = Math.min(level, maxLevelFromCoverage(levelCoverage, 25))
  return level
}

function scoreToLearnixLevel(score, topicsAttempted, masteredCount, levelCoverage = {}) {
  return deriveLearnixLevel(score, topicsAttempted, masteredCount, levelCoverage)
}

function computeOverallSkillScores(skillProfiles, levelCoverage = {}, coverage = {}) {
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

  const rawScore = confSum > 0 ? Math.round(scoreSum / confSum) : 0
  const confidence = Math.min(1, confSum / active.length)
  const eligibleTopics = active.reduce(
    (a, s) => a + countEligibleTopics(skillProfiles[s].topics ?? []).length,
    0,
  )
  const masteredTopics = active.reduce(
    (a, s) => a + (skillProfiles[s].topics?.filter((t) => t.mastered).length ?? 0),
    0,
  )

  const hasCoverageMeta =
    typeof coverage.attemptedTopics === "number" && typeof coverage.totalTopics === "number"
  const score = hasCoverageMeta
    ? adjustScoreForCoverage(
        rawScore,
        levelCoverage,
        coverage.attemptedTopics,
        coverage.totalTopics,
      )
    : rawScore
  const level = deriveLearnixLevel(score, eligibleTopics, masteredTopics, levelCoverage)

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

/**
 * Collect IELTS reading/listening band observations from homework + mock tests.
 * Podcast listening homework is excluded (no band score).
 */
async function collectIeltsSkillBands(studentId) {
  const [subs, homeworkList, mocks] = await Promise.all([
    Submission.find({ studentId, status: { $in: ["submitted", "graded"] } }).lean(),
    Homework.find().select("_id subject exerciseSlug title").lean(),
    TestResult.find({
      studentId,
      testType: { $in: ["reading", "listening"] },
    }).lean(),
  ])
  const hwById = new Map(homeworkList.map((h) => [h._id, h]))
  const reading = []
  const listening = []

  for (const sub of subs) {
    if (isCheatingSubmission(sub)) continue
    const hw = hwById.get(sub.homeworkId)
    const subject = sub.subject ?? hw?.subject
    const exerciseSlug = hw?.exerciseSlug ?? ""
    if (subject === "listening" && exerciseSlug.startsWith(PODCAST_SLUG_PREFIX)) continue
    if (subject !== "reading" && subject !== "listening") continue

    let band = typeof sub.score === "number" ? sub.score : null
    const attempt = sub.attempt
    if (band == null && attempt?.totalQuestions > 0) {
      band = cambridgeBandFromAttempt(subject, attempt.totalQuestions, attempt.correctCount)
    }
    if (band == null || Number.isNaN(band)) continue

    const entry = {
      band,
      at: sub.submittedAt ?? sub.assignedAt ?? new Date(),
      slug: `hw:${exerciseSlug || subject}`,
      title: hw?.title ?? exerciseSlug ?? subject,
      source: "homework",
      correctCount: attempt?.correctCount,
      totalQuestions: attempt?.totalQuestions,
    }
    if (subject === "reading") reading.push(entry)
    else listening.push(entry)
  }

  for (const mock of mocks) {
    if (typeof mock.bandScore !== "number") continue
    const entry = {
      band: mock.bandScore,
      at: mock.date ?? new Date(),
      slug: `mock:${mock._id}`,
      title: `Mock ${mock.testType}`,
      source: "mock_test",
      correctCount: mock.totalCorrect,
      totalQuestions: mock.totalQuestions,
    }
    if (mock.testType === "reading") reading.push(entry)
    else if (mock.testType === "listening") listening.push(entry)
  }

  return { reading, listening }
}

/** Build a Learnix skill profile from IELTS band observations. */
function buildIeltsSkillProfile(bandEntries, now = new Date()) {
  if (!bandEntries.length) {
    return { hasData: false, score: 0, confidence: 0, level: 1, topics: [] }
  }

  let scoreSum = 0
  let wSum = 0
  const topics = []

  for (const entry of bandEntries) {
    const learnix = ieltsBandToLearnixScore(entry.band)
    const w = recencyWeight(entry.at, now)
    scoreSum += learnix * w
    wSum += w

    const totalQ = entry.totalQuestions > 0 ? entry.totalQuestions : 40
    const correctQ =
      entry.correctCount != null ? entry.correctCount : Math.round((entry.band / 9) * totalQ)
    const accuracy = totalQ > 0 ? Math.round((correctQ / totalQ) * 1000) / 10 : 0
    const conf = confidenceFromQuestions(totalQ)

    topics.push({
      slug: entry.slug,
      title: entry.title,
      learnixLevel: Math.max(1, Math.min(9, Math.round((learnix / 1000) * 9))),
      attemptedQuestions: totalQ,
      correctAnswers: correctQ,
      accuracy,
      weightedAccuracy: Math.round((learnix / 1000) * 1000) / 10,
      confidence: conf,
      mastered: entry.band >= 7,
      needsReview: entry.band < 5.5,
      lastPracticedAt: entry.at,
      source: entry.source,
    })
  }

  const score = wSum > 0 ? Math.round(scoreSum / wSum) : 0
  const confidence = ieltsSkillConfidenceFromAttempts(bandEntries.length)
  const level = Math.max(1, Math.min(9, Math.round((score / 1000) * 9)))

  return { hasData: true, score, confidence, level, topics }
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

  const vocabularyAudit = {
    sources: {
      wordAnswerEvents: { events: 0, questions: 0 },
      studentActivity: { events: 0, questions: 0 },
      submissions: { events: 0, questions: 0 },
      controlWork: { events: 0, questions: 0 },
    },
  }

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
      addAttempt(acc, correct, total, at, lw, "submission")
      vocabularyAudit.sources.submissions.events += 1
      vocabularyAudit.sources.submissions.questions += total ?? 0
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
      addAttempt(
        acc,
        a.correctCount,
        a.totalQuestions,
        at,
        topicLevelWeight(acc.learnixLevel),
        "studentActivity",
      )
      vocabularyAudit.sources.studentActivity.events += 1
      vocabularyAudit.sources.studentActivity.questions += a.totalQuestions ?? 0
    }
  }

  for (const w of wordEvents) {
    const deck = deckMap.get(w.deckSlug)
    const acc = ensureVocab(
      w.deckSlug,
      deck?.title ?? w.deckSlug,
      deck ? vocabDeckLevel(deck.level, deck.difficulty) : 3,
    )
    const qWeight = WORD_EVENT_QUESTION_WEIGHT ?? 0.25
    addAttempt(
      acc,
      w.correct ? qWeight : 0,
      qWeight,
      w.at,
      topicLevelWeight(acc.learnixLevel),
      "wordAnswerEvent",
    )
    vocabularyAudit.sources.wordAnswerEvents.events += 1
    vocabularyAudit.sources.wordAnswerEvents.questions += qWeight
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
        addAttempt(
          acc,
          correctCount,
          totalQuestions,
          at,
          topicLevelWeight(acc.learnixLevel),
          "controlWork",
        )
        vocabularyAudit.sources.controlWork.events += 1
        vocabularyAudit.sources.controlWork.questions += totalQuestions ?? 0
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
    vocabularyAudit,
  }
}

function buildSkillProfile(topicMap, levelCoverage = {}, speakingDimensions = null) {
  const topicStats = [...topicMap.values()]
    .map((acc) => computeTopicStats(acc))
    .filter(Boolean)
    .sort((a, b) => b.weightedAccuracy - a.weightedAccuracy)

  const { score, confidence, level, hasData } = computeSkillScore(topicStats, levelCoverage)
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

function buildFilteredTopicMap(topicMap, allowedSources) {
  if (!allowedSources || !allowedSources.size) return topicMap
  const filtered = new Map()
  for (const [slug, acc] of topicMap.entries()) {
    const attempts = (acc.attempts ?? []).filter((a) => {
      if (!a.source) return false
      return allowedSources.has(a.source)
    })
    if (!attempts.length) continue
    filtered.set(slug, { ...acc, attempts })
  }
  return filtered
}

function buildSkillDebug(topicMap, levelCoverage = {}, allowedSources = null) {
  const filtered = allowedSources ? buildFilteredTopicMap(topicMap, allowedSources) : topicMap
  const topicStats = [...filtered.values()].map((acc) => computeTopicStats(acc)).filter(Boolean)
  const { profile, debug } = computeSkillScoreDebug(topicStats, levelCoverage)
  return { profile: { ...profile, topics: topicStats }, debug }
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

  const grammarDraft = buildSkillProfile(grammarTopics)
  const vocabularyDraft = buildSkillProfile(vocabTopics)
  const levelCoverage = computeLevelCoverage(grammarDraft.topics, vocabularyDraft.topics)

  const grammar = buildSkillProfile(grammarTopics, levelCoverage)
  const vocabulary = buildSkillProfile(vocabTopics, levelCoverage)
  // Override vocabulary "mastered" to depend on word streak mastery (not quiz completion).
  const deckProgress = await StudentDeckProgress.find({ studentId })
    .select("deckSlug wordsMastered totalWords")
    .lean()
  const deckProgressBySlug = new Map(deckProgress.map((d) => [d.deckSlug, d]))
  vocabulary.topics = applyVocabDeckMastery(vocabulary.topics ?? [], deckProgressBySlug)
  const speakingTopicsStats = [...speakingTopics.values()]
    .map((acc) => computeTopicStats(acc))
    .filter(Boolean)

  const speakingBase = buildSkillProfile(speakingTopics, levelCoverage)
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
      const eligibleSpeaking = countEligibleTopics(speaking.topics)
      speaking.level = deriveLearnixLevel(
        speaking.score,
        eligibleSpeaking.length,
        eligibleSpeaking.filter((t) => t.mastered).length,
        levelCoverage,
      )
    }
    speaking.confidence = speakingConf
  }

  const ieltsBands = await collectIeltsSkillBands(studentId)
  const reading = buildIeltsSkillProfile(ieltsBands.reading, now)
  const listening = buildIeltsSkillProfile(ieltsBands.listening, now)

  const deckMap = await loadVocabDeckMap()
  const topicMasteryRecords = computeAllTopicMasteries(
    studentId,
    orgId ?? "unknown",
    {
      grammarTopicStats: grammar.topics ?? [],
      vocabTopicStats: vocabulary.topics ?? [],
      grammarTopicAccumulators: grammarTopics,
      deckMap,
    },
    now,
  )
  await persistTopicMasteries(topicMasteryRecords)

  const skillProfiles = { grammar, vocabulary, speaking, reading, listening, writing: { hasData: false, score: 0 } }
  const ieltsProfile = buildIeltsLanguageProfile(topicMasteryRecords, skillProfiles)

  grammar.topics = enrichTopicsWithMastery(grammar.topics ?? [], topicMasteryRecords)
  vocabulary.topics = enrichTopicsWithMastery(vocabulary.topics ?? [], topicMasteryRecords)

  const allTopics = [
    ...grammar.topics,
    ...vocabulary.topics,
    ...speaking.topics,
  ]
  const masteredTopics = allTopics.filter((t) => t.mastered).map((t) => t.slug)
  const eligibleAllTopics = countEligibleTopics(allTopics)
  const needsReviewTopics = eligibleAllTopics.filter((t) => t.needsReview).map((t) => t.slug)

  const vocabCatalogueCount = await VocabDeck.countDocuments()
  const coverageMeta = {
    attemptedTopics: eligibleAllTopics.length,
    masteredTopics: masteredTopics.length,
    totalTopics: GRAMMAR_TOPIC_COUNT + vocabCatalogueCount,
    needsReviewTopics: needsReviewTopics.length,
  }

  const skillProfilesForOverall = { grammar, vocabulary, speaking, reading, listening }
  const overall = computeOverallSkillScores(skillProfilesForOverall, levelCoverage, coverageMeta)

  const doc = {
    _id: studentId,
    studentId,
    orgId: orgId ?? "unknown",
    grammar,
    vocabulary,
    speaking,
    reading,
    listening,
    writing: { hasData: false, score: 0, confidence: 0, level: 1, topics: [] },
    overall,
    coverage: coverageMeta,
    masteredTopics,
    needsReviewTopics,
    levelCoverage,
    recommendations: [],
    cefrProfile: ieltsProfile.cefrProfile,
    grammarCefrProfile: ieltsProfile.grammarCefrProfile,
    vocabularyCefrProfile: ieltsProfile.vocabularyCefrProfile,
    ieltsEstimation: ieltsProfile.ieltsEstimation,
    ieltsRecommendation: ieltsProfile.ieltsRecommendation,
    lastComputedAt: now,
    version: 3,
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

/**
 * Diagnostic endpoint payload — explains how every score was computed.
 * Does not persist changes.
 */
export async function getStudentLanguageProfileDebug(studentId) {
  const now = new Date()
  const { grammarTopics, vocabTopics, speakingTopics, speakingSubmissions, vocabularyAudit } =
    await collectTopicData(studentId)

  const deckProgress = await StudentDeckProgress.find({ studentId })
    .select("deckSlug wordsMastered totalWords")
    .lean()
  const deckProgressBySlug = new Map(deckProgress.map((d) => [d.deckSlug, d]))

  const speakingDimensions = computeSpeakingDimensions(speakingSubmissions, now)
  const approvedSpeakingCount = countApprovedSpeakingAssessments(speakingSubmissions)
  const speakingConf = speakingConfidenceFromAssessments(approvedSpeakingCount)

  const grammarDraft = buildSkillProfile(grammarTopics)
  const vocabularyDraft = buildSkillProfile(vocabTopics)
  const levelCoverage = computeLevelCoverage(grammarDraft.topics, vocabularyDraft.topics)

  const { debug: grammarDebug, profile: grammarProfile } = buildSkillDebug(grammarTopics, levelCoverage)
  const { debug: vocabularyDebug, profile: vocabularyProfile } = buildSkillDebug(vocabTopics, levelCoverage)
  vocabularyProfile.topics = applyVocabDeckMastery(vocabularyProfile.topics ?? [], deckProgressBySlug)

  const speakingTopicsStats = [...speakingTopics.values()].map((acc) => computeTopicStats(acc)).filter(Boolean)
  const { profile: speakingBaseProfile, debug: speakingBaseDebug } = buildSkillDebug(
    speakingTopics,
    levelCoverage,
  )
  const speakingScore = speakingScoreFromDimensions(
    speakingDimensions,
    speakingTopicsStats,
    speakingSubmissions,
  )
  const eligibleSpeaking = countEligibleTopics(speakingTopicsStats)
  const speakingMastered = eligibleSpeaking.filter((t) => t.mastered).length
  const speakingLevel = speakingScore > 0
    ? deriveLearnixLevel(
        speakingScore,
        eligibleSpeaking.length,
        speakingMastered,
        levelCoverage,
      )
    : 1

  const speakingProfile = {
    ...speakingBaseProfile,
    score: speakingScore,
    confidence: speakingConf,
    level: speakingLevel,
    hasData:
      speakingBaseProfile.hasData ||
      approvedSpeakingCount > 0 ||
      Object.values(speakingDimensions).some((v) => v > 0),
    dimensions: speakingDimensions,
    topics: speakingTopicsStats,
  }

  const ieltsBands = await collectIeltsSkillBands(studentId)
  const readingProfile = buildIeltsSkillProfile(ieltsBands.reading, now)
  const listeningProfile = buildIeltsSkillProfile(ieltsBands.listening, now)

  const skillProfiles = {
    grammar: { ...grammarProfile, topics: grammarProfile.topics ?? [] },
    vocabulary: { ...vocabularyProfile, topics: vocabularyProfile.topics ?? [] },
    speaking: speakingProfile,
    reading: readingProfile,
    listening: listeningProfile,
  }

  // Overall raw score (confidence-weighted average of skill scores).
  const active = MEASURED_SKILLS.filter(
    (s) => skillProfiles[s]?.hasData && (skillProfiles[s].confidence ?? 0) > 0,
  )
  let rawOverallScore = 0
  let rawOverallConfidence = 0
  if (active.length) {
    let scoreSum = 0
    let confSum = 0
    for (const skill of active) {
      const p = skillProfiles[skill]
      scoreSum += (p.score ?? 0) * (p.confidence ?? 0)
      confSum += p.confidence ?? 0
    }
    rawOverallScore = confSum > 0 ? Math.round(scoreSum / confSum) : 0
    rawOverallConfidence = Math.min(1, confSum / active.length)
  }

  const allTopics = [
    ...(skillProfiles.grammar.topics ?? []),
    ...(skillProfiles.vocabulary.topics ?? []),
    ...(skillProfiles.speaking.topics ?? []),
  ]
  const eligibleAllTopics = countEligibleTopics(allTopics)
  const vocabCatalogueCount = await VocabDeck.countDocuments()
  const attemptedTopics = eligibleAllTopics.length
  const totalTopics = GRAMMAR_TOPIC_COUNT + vocabCatalogueCount

  const { finalScore: overallFinalScore, breadthPenalty, levelPenalty } = coveragePenaltyDebug(
    rawOverallScore,
    levelCoverage,
    attemptedTopics,
    totalTopics,
  )

  const eligibleTopicsCount = active.reduce(
    (a, s) => a + countEligibleTopics(skillProfiles[s].topics ?? []).length,
    0,
  )
  const masteredTopicsCount = active.reduce(
    (a, s) => a + (countEligibleTopics(skillProfiles[s].topics ?? []).filter((t) => t.mastered).length ?? 0),
    0,
  )
  const overallLevel = deriveLearnixLevel(
    overallFinalScore,
    eligibleTopicsCount,
    masteredTopicsCount,
    levelCoverage,
  )

  const sourceSets = {
    submissions: new Set(["submission"]),
    studentActivity: new Set(["studentActivity"]),
    wordAnswerEvents: new Set(["wordAnswerEvent"]),
    controlWork: new Set(["controlWork"]),
  }
  const vocabularySources = Object.entries(sourceSets).map(([key, set]) => {
    const { debug: d } = buildSkillDebug(vocabTopics, levelCoverage, set)
    const src = vocabularyAudit.sources[key] ?? { events: 0, questions: 0 }
    return {
      source: key,
      events: src.events,
      questions: src.questions,
      scoreIfOnlySource: d.finalScore,
      rawScoreIfOnlySource: d.rawScore,
      eligibleTopics: d.eligibleTopics,
    }
  })

  return {
    grammar: {
      ...grammarDebug,
      finalScore: grammarProfile.score,
    },
    vocabulary: {
      ...vocabularyDebug,
      finalScore: vocabularyProfile.score,
      sources: vocabularySources,
    },
    speaking: {
      rawScore: speakingBaseDebug.rawScore,
      confidence: speakingConf,
      finalScore: speakingScore,
      level: speakingLevel,
      approvedAssessments: approvedSpeakingCount,
    },
    reading: {
      rawScore: readingProfile.score,
      confidence: readingProfile.confidence,
      finalScore: readingProfile.score,
      level: readingProfile.level,
      attempts: ieltsBands.reading.length,
    },
    listening: {
      rawScore: listeningProfile.score,
      confidence: listeningProfile.confidence,
      finalScore: listeningProfile.score,
      level: listeningProfile.level,
      attempts: ieltsBands.listening.length,
    },
    overall: {
      rawScore: rawOverallScore,
      breadthPenalty,
      levelPenalty,
      finalScore: overallFinalScore,
      level: overallLevel,
      confidence: rawOverallConfidence,
      attemptedTopics,
      totalTopics,
    },
    meta: {
      computedAt: now,
      levelCoverage,
    },
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
        readingScore: profile?.reading?.score ?? null,
        listeningScore: profile?.listening?.score ?? null,
        hasData: !!(
          profile?.grammar?.hasData ||
          profile?.vocabulary?.hasData ||
          profile?.speaking?.hasData ||
          profile?.reading?.hasData ||
          profile?.listening?.hasData
        ),
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
  deriveLearnixLevel,
  applyBreadthPenalty,
  adjustScoreForCoverage,
  maxLevelFromCoverage,
  buildLevelCatalogue,
  computeSkillScoreDebug,
  coveragePenaltyDebug,
  buildIeltsSkillProfile,
  ieltsBandToLearnixScore,
}
