/**
 * IELTS Recommendation Engine
 *
 * Explains current band estimate, identifies blocking topics,
 * and suggests highest-ROI topics for the next band target.
 */

import {
  BAND_PROGRESSION_RULES,
  MASTERY_SCORE_MASTERED,
  HOURS_PER_MASTERY_POINT,
  getTopicById,
  getTopicsByLevel,
  roundIeltsBand,
  CEFR_LEVELS,
} from "../config/ielts-topic-catalogue.js"
import { bandFromCefrProgress } from "./cefrProfile.service.js"

/**
 * Determine next band target from current estimate.
 */
export function computeNextBandTarget(currentBand) {
  const bands = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0]
  for (const b of bands) {
    if (b > currentBand + 0.01) return b
  }
  return 9.0
}

/**
 * Topics required for a target band based on progression rules.
 */
export function getRequiredLevelsForBand(targetBand) {
  const rule = BAND_PROGRESSION_RULES.find((r) => r.band === targetBand)
  if (!rule) {
    const lower = BAND_PROGRESSION_RULES.find((r) => r.band <= targetBand)
    return lower?.requirements ?? {}
  }
  return rule.requirements ?? {}
}

/**
 * Find topics blocking progression to nextBandTarget.
 */
export function findMissingTopics(topicMasteries, cefrProfile, nextBandTarget) {
  const requirements = getRequiredLevelsForBand(nextBandTarget)
  const missing = []

  for (const [level, minPct] of Object.entries(requirements)) {
    const current = cefrProfile[level] ?? 0
    if (current < minPct) {
      const gap = minPct - current
      const levelTopics = topicMasteries.filter((m) => m.cefrLevel === level)
      const unmastered = levelTopics
        .filter((m) => (m.masteryScore ?? 0) < MASTERY_SCORE_MASTERED)
        .sort((a, b) => (a.masteryScore ?? 0) - (b.masteryScore ?? 0))

      for (const m of unmastered.slice(0, 5)) {
        const topic = getTopicById(m.topicId)
        missing.push({
          topicId: m.topicId,
          name: topic?.name ?? m.topicId,
          level,
          masteryScore: m.masteryScore ?? 0,
          gap,
          category: m.category,
        })
      }
    }
  }

  return missing
}

/**
 * Rank topics by expected IELTS band uplift (ROI).
 */
export function rankTopicsByRoi(topicMasteries, currentBand, nextBandTarget) {
  const candidates = topicMasteries.filter(
    (m) =>
      (m.masteryScore ?? 0) < MASTERY_SCORE_MASTERED &&
      (m.attemptedQuestions ?? 0) >= 0,
  )

  return candidates
    .map((m) => {
      const topic = getTopicById(m.topicId)
      if (!topic) return null

      const gap = MASTERY_SCORE_MASTERED - (m.masteryScore ?? 0)
      const bandUplift = topic.isCritical ? 0.5 : 0.25
      const levelWeight = { A1: 0.5, A2: 1, B1: 2, B2: 4, C1: 6, C2: 3 }[topic.level] ?? 1
      const roi = (bandUplift * levelWeight) / Math.max(1, gap)

      return {
        topicId: m.topicId,
        name: topic.name,
        level: topic.level,
        category: m.category,
        masteryScore: m.masteryScore ?? 0,
        bandUplift,
        roi,
        isCritical: topic.isCritical ?? false,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 8)
}

/**
 * Estimate study hours to reach next band target.
 */
export function estimateStudyHours(missingTopics, recommendedTopics) {
  const seen = new Set()
  let hours = 0

  for (const t of [...missingTopics, ...recommendedTopics]) {
    if (seen.has(t.topicId)) continue
    seen.add(t.topicId)
    const gap = MASTERY_SCORE_MASTERED - (t.masteryScore ?? 0)
    hours += Math.max(0, gap) * HOURS_PER_MASTERY_POINT
  }

  return Math.round(hours)
}

/**
 * Build human-readable explanation of current estimate.
 */
export function buildEstimationExplanation(estimation, recommendation) {
  const parts = []

  parts.push(
    `Estimated Band ${estimation.estimatedBand} based on Topic Mastery → CEFR → IELTS model (confidence ${estimation.confidence}%).`,
  )

  if (estimation.potentialBand > estimation.estimatedBand) {
    parts.push(
      `Raw skill average suggests Band ${estimation.potentialBand}, but ceiling logic reduced the estimate.`,
    )
  }

  if (estimation.limitingFactors?.length) {
    parts.push(`Limiting factors: ${estimation.limitingFactors.slice(0, 4).join(", ")}.`)
  }

  if (recommendation.nextBandTarget > estimation.estimatedBand) {
    parts.push(
      `To reach Band ${recommendation.nextBandTarget}, focus on ${recommendation.recommendedTopics.slice(0, 3).map((t) => t.name).join(", ") || "foundational topics"}.`,
    )
  }

  return parts.join(" ")
}

/**
 * Full recommendation payload.
 */
export function buildIeltsRecommendations(estimation, topicMasteries) {
  const nextBandTarget = computeNextBandTarget(estimation.estimatedBand)
  const missingTopics = findMissingTopics(
    topicMasteries,
    estimation.cefrProfile,
    nextBandTarget,
  )
  const recommendedTopics = rankTopicsByRoi(
    topicMasteries,
    estimation.estimatedBand,
    nextBandTarget,
  )
  const estimatedStudyHours = estimateStudyHours(missingTopics, recommendedTopics)

  const recommendation = {
    nextBandTarget,
    missingTopics: missingTopics.map((t) => ({
      topicId: t.topicId,
      name: t.name,
      level: t.level,
      masteryScore: t.masteryScore,
      category: t.category,
    })),
    recommendedTopics: recommendedTopics.map((t) => ({
      topicId: t.topicId,
      name: t.name,
      level: t.level,
      masteryScore: t.masteryScore,
      expectedBandUplift: t.bandUplift,
      category: t.category,
    })),
    estimatedStudyHours,
  }

  recommendation.explanation = buildEstimationExplanation(estimation, recommendation)

  return recommendation
}

export const _internal = {
  computeNextBandTarget,
  getRequiredLevelsForBand,
  estimateStudyHours,
}
