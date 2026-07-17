/**
 * Topic Mastery Service
 *
 * Computes masteryScore (0–100) per topic from exercise statistics.
 *
 * Formula:
 *   masteryScore = accuracyComponent + confidenceComponent + attemptComponent
 *                  + recencyComponent + stabilityComponent
 *
 * Components:
 *   accuracyComponent  = weightedAccuracy × 0.45          (0–45)
 *   confidenceComponent  = confidence × 20                  (0–20)
 *   attemptComponent     = min(15, sqrt(attempts) × 4)      (0–15)
 *   recencyComponent     = recencyWeight(lastAttempt) × 10  (0–10)
 *   stabilityComponent   = (1 - variance) × 10              (0–10)
 */

import {
  MASTERY_SCORE_MASTERED,
  MASTERY_SCORE_PARTIAL,
  getTopicById,
  resolveCatalogueTopicId,
  GRAMMAR_TOPIC_CATALOGUE,
  VOCABULARY_TOPIC_CATALOGUE,
  ACADEMIC_VOCABULARY_CATALOGUE,
} from "../config/ielts-topic-catalogue.js"
import { recencyWeight } from "../config/language-profile.js"

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function masteryStatusFromScore(score) {
  if (score >= MASTERY_SCORE_MASTERED) return "mastered"
  if (score >= MASTERY_SCORE_PARTIAL) return "partial"
  return "not_mastered"
}

/**
 * Stability from attempt accuracies — low variance = high stability.
 * @param {Array<{ correct: number, total: number }>} attempts
 */
function computeStability(attempts) {
  if (!attempts?.length || attempts.length < 2) return 0.5
  const accs = attempts
    .filter((a) => a.total > 0)
    .map((a) => a.correct / a.total)
  if (accs.length < 2) return 0.5
  const mean = accs.reduce((s, v) => s + v, 0) / accs.length
  const variance = accs.reduce((s, v) => s + (v - mean) ** 2, 0) / accs.length
  return clamp(1 - Math.sqrt(variance) * 2, 0, 1)
}

/**
 * @param {object} params
 * @param {number} params.weightedAccuracy — 0–100
 * @param {number} params.confidence — 0–1
 * @param {number} params.attempts
 * @param {Date|null} params.lastAttemptAt
 * @param {Array} [params.rawAttempts]
 * @param {Date} [params.now]
 */
export function computeMasteryScore({
  weightedAccuracy = 0,
  confidence = 0,
  attempts = 0,
  lastAttemptAt = null,
  rawAttempts = [],
  now = new Date(),
}) {
  const accuracyComponent = (weightedAccuracy / 100) * 45
  const confidenceComponent = confidence * 20
  const attemptComponent = Math.min(15, Math.sqrt(Math.max(0, attempts)) * 4)
  const recencyComponent = recencyWeight(lastAttemptAt, now) * 10
  const stabilityComponent = computeStability(rawAttempts) * 10

  const score = clamp(
    Math.round(accuracyComponent + confidenceComponent + attemptComponent + recencyComponent + stabilityComponent),
    0,
    100,
  )

  return {
    masteryScore: score,
    masteryStatus: masteryStatusFromScore(score),
    components: {
      accuracy: Math.round(accuracyComponent * 10) / 10,
      confidence: Math.round(confidenceComponent * 10) / 10,
      attempts: Math.round(attemptComponent * 10) / 10,
      recency: Math.round(recencyComponent * 10) / 10,
      stability: Math.round(stabilityComponent * 10) / 10,
    },
  }
}

/**
 * Build mastery record from existing topic stat (from language profile recompute).
 * @param {string} studentId
 * @param {string} orgId
 * @param {object} topicStat — computed topic stats from studentLanguageProfile
 * @param {object} catalogueTopic — from ielts-topic-catalogue
 * @param {Array} [rawAttempts]
 */
export function buildTopicMasteryRecord(
  studentId,
  orgId,
  topicStat,
  catalogueTopic,
  rawAttempts = [],
  now = new Date(),
) {
  const { masteryScore, masteryStatus, components } = computeMasteryScore({
    weightedAccuracy: topicStat.weightedAccuracy ?? topicStat.accuracy ?? 0,
    confidence: topicStat.confidence ?? 0,
    attempts: topicStat.totalAttempts ?? 0,
    lastAttemptAt: topicStat.lastAttemptAt ?? null,
    rawAttempts,
    now,
  })

  return {
    studentId,
    orgId,
    topicId: catalogueTopic.id,
    category: catalogueTopic.category,
    cefrLevel: catalogueTopic.level,
    masteryScore,
    confidenceScore: topicStat.confidence ?? 0,
    attempts: topicStat.totalAttempts ?? 0,
    attemptedQuestions: topicStat.attemptedQuestions ?? 0,
    weightedAccuracy: topicStat.weightedAccuracy ?? 0,
    masteryStatus,
    lastPracticedAt: topicStat.lastAttemptAt ?? null,
    lastComputedAt: now,
    _components: components,
  }
}

/**
 * Aggregate grammar topic stats → catalogue topic masteries.
 * Multiple exercise slugs may map to one catalogue topic via aliases.
 */
export function aggregateGrammarMasteries(studentId, orgId, grammarTopicStats, topicAccumulators = new Map(), now = new Date()) {
  /** @type {Map<string, { stat: object, attempts: Array }>} */
  const byCatalogueId = new Map()

  for (const stat of grammarTopicStats) {
    const catalogueId = resolveCatalogueTopicId(stat.slug, "grammar")
    const topic = getTopicById(catalogueId)
    if (!topic || topic.category !== "grammar") continue

    const acc = topicAccumulators.get(stat.slug)
    const existing = byCatalogueId.get(catalogueId)
    if (!existing) {
      byCatalogueId.set(catalogueId, { stat: { ...stat, slug: catalogueId }, attempts: acc?.attempts ?? [] })
    } else {
      // Merge stats — take weighted average by question count
      const q1 = existing.stat.attemptedQuestions ?? 0
      const q2 = stat.attemptedQuestions ?? 0
      const totalQ = q1 + q2
      if (totalQ > 0) {
        existing.stat.weightedAccuracy =
          ((existing.stat.weightedAccuracy ?? 0) * q1 + (stat.weightedAccuracy ?? 0) * q2) / totalQ
        existing.stat.accuracy =
          ((existing.stat.accuracy ?? 0) * q1 + (stat.accuracy ?? 0) * q2) / totalQ
        existing.stat.confidence = Math.max(existing.stat.confidence ?? 0, stat.confidence ?? 0)
        existing.stat.attemptedQuestions = totalQ
        existing.stat.totalAttempts = (existing.stat.totalAttempts ?? 0) + (stat.totalAttempts ?? 0)
        existing.stat.lastAttemptAt =
          !existing.stat.lastAttemptAt || (stat.lastAttemptAt && stat.lastAttemptAt > existing.stat.lastAttemptAt)
            ? stat.lastAttemptAt
            : existing.stat.lastAttemptAt
      }
      if (acc?.attempts) existing.attempts.push(...acc.attempts)
    }
  }

  const records = []
  for (const [catalogueId, { stat, attempts }] of byCatalogueId) {
    const topic = getTopicById(catalogueId)
    if (!topic) continue
    records.push(buildTopicMasteryRecord(studentId, orgId, stat, topic, attempts, now))
  }

  // Fill catalogue topics with zero data
  for (const topic of GRAMMAR_TOPIC_CATALOGUE) {
    if (!records.some((r) => r.topicId === topic.id)) {
      records.push({
        studentId,
        orgId,
        topicId: topic.id,
        category: topic.category,
        cefrLevel: topic.level,
        masteryScore: 0,
        confidenceScore: 0,
        attempts: 0,
        attemptedQuestions: 0,
        weightedAccuracy: 0,
        masteryStatus: "not_mastered",
        lastPracticedAt: null,
        lastComputedAt: now,
      })
    }
  }

  return records
}

/**
 * Aggregate vocabulary deck stats into CEFR-level vocabulary topics.
 */
export function aggregateVocabularyMasteries(studentId, orgId, vocabTopicStats, now = new Date()) {
  /** @type {Map<string, { stats: object[], totalQ: number }>} */
  const byLevel = new Map()

  for (const stat of vocabTopicStats) {
    const level = stat.learnixLevel != null
      ? ["", "A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C2"][Math.min(9, Math.max(1, stat.learnixLevel))]
      : "A1"
    const bucket = byLevel.get(level) ?? { stats: [], totalQ: 0 }
    bucket.stats.push(stat)
    bucket.totalQ += stat.attemptedQuestions ?? 0
    byLevel.set(level, bucket)
  }

  const records = []
  for (const topic of VOCABULARY_TOPIC_CATALOGUE) {
    const bucket = byLevel.get(topic.deckLevel)
    if (!bucket?.stats.length) {
      records.push({
        studentId,
        orgId,
        topicId: topic.id,
        category: topic.category,
        cefrLevel: topic.level,
        masteryScore: 0,
        confidenceScore: 0,
        attempts: 0,
        attemptedQuestions: 0,
        weightedAccuracy: 0,
        masteryStatus: "not_mastered",
        lastPracticedAt: null,
        lastComputedAt: now,
      })
      continue
    }

    let weightedSum = 0
    let qSum = 0
    let confSum = 0
    let attempts = 0
    let lastAt = null
    for (const s of bucket.stats) {
      const q = s.attemptedQuestions ?? 0
      weightedSum += (s.weightedAccuracy ?? 0) * q
      qSum += q
      confSum += s.confidence ?? 0
      attempts += s.totalAttempts ?? 0
      if (!lastAt || (s.lastAttemptAt && s.lastAttemptAt > lastAt)) lastAt = s.lastAttemptAt
    }

    const stat = {
      weightedAccuracy: qSum > 0 ? weightedSum / qSum : 0,
      confidence: confSum / bucket.stats.length,
      totalAttempts: attempts,
      attemptedQuestions: qSum,
      lastAttemptAt: lastAt,
      mastered: bucket.stats.some((s) => s.mastered),
    }
    records.push(buildTopicMasteryRecord(studentId, orgId, stat, topic, [], now))
  }

  return records
}

/**
 * Academic vocabulary from decks tagged academic or high CEFR + B2+ decks with academic topics.
 */
export function aggregateAcademicVocabularyMasteries(studentId, orgId, vocabTopicStats, deckMap = new Map(), now = new Date()) {
  const academicDeckStats = vocabTopicStats.filter((s) => {
    const deck = deckMap.get(s.slug)
    if (!deck) return false
    const topic = (deck.topic ?? "").toLowerCase()
    const level = (deck.level ?? "").toUpperCase()
    return (
      topic.includes("academic") ||
      topic.includes("ielts") ||
      topic.includes("essay") ||
      (level === "C1" || level === "C2" || level === "B2") && topic.includes("formal")
    )
  })

  const records = []
  for (const catalogueTopic of ACADEMIC_VOCABULARY_CATALOGUE) {
    const levelFilter = catalogueTopic.level
    const matching = academicDeckStats.filter((s) => {
      const deck = deckMap.get(s.slug)
      const level = (deck?.level ?? "B2").toUpperCase()
      return level === levelFilter || (levelFilter === "B2" && ["B2", "B1"].includes(level))
    })

    if (!matching.length) {
      // Fallback: use aggregate B2/C1 general vocab as proxy
      const proxyLevel = catalogueTopic.level
      const proxyStats = vocabTopicStats.filter((s) => {
        const deck = deckMap.get(s.slug)
        return (deck?.level ?? "").toUpperCase() === proxyLevel
      })
      if (proxyStats.length) {
        let wSum = 0
        let qSum = 0
        for (const s of proxyStats) {
          wSum += (s.weightedAccuracy ?? 0) * (s.attemptedQuestions ?? 0)
          qSum += s.attemptedQuestions ?? 0
        }
        const stat = {
          weightedAccuracy: qSum > 0 ? wSum / qSum : 0,
          confidence: proxyStats.reduce((a, s) => a + (s.confidence ?? 0), 0) / proxyStats.length,
          totalAttempts: proxyStats.reduce((a, s) => a + (s.totalAttempts ?? 0), 0),
          attemptedQuestions: qSum,
          lastAttemptAt: proxyStats.reduce((latest, s) => {
            if (!s.lastAttemptAt) return latest
            return !latest || s.lastAttemptAt > latest ? s.lastAttemptAt : latest
          }, null),
        }
        records.push(buildTopicMasteryRecord(studentId, orgId, stat, catalogueTopic, [], now))
        continue
      }

      records.push({
        studentId,
        orgId,
        topicId: catalogueTopic.id,
        category: catalogueTopic.category,
        cefrLevel: catalogueTopic.level,
        masteryScore: 0,
        confidenceScore: 0,
        attempts: 0,
        attemptedQuestions: 0,
        weightedAccuracy: 0,
        masteryStatus: "not_mastered",
        lastPracticedAt: null,
        lastComputedAt: now,
      })
      continue
    }

    let wSum = 0
    let qSum = 0
    let confSum = 0
    let attempts = 0
    let lastAt = null
    for (const s of matching) {
      const q = s.attemptedQuestions ?? 0
      wSum += (s.weightedAccuracy ?? 0) * q
      qSum += q
      confSum += s.confidence ?? 0
      attempts += s.totalAttempts ?? 0
      if (!lastAt || (s.lastAttemptAt && s.lastAttemptAt > lastAt)) lastAt = s.lastAttemptAt
    }
    const stat = {
      weightedAccuracy: qSum > 0 ? wSum / qSum : 0,
      confidence: confSum / matching.length,
      totalAttempts: attempts,
      attemptedQuestions: qSum,
      lastAttemptAt: lastAt,
    }
    records.push(buildTopicMasteryRecord(studentId, orgId, stat, catalogueTopic, [], now))
  }

  return records
}

export const _internal = {
  computeStability,
  masteryStatusFromScore,
}
