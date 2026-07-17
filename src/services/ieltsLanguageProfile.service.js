/**
 * Orchestrates topic mastery persistence and IELTS estimation for a student.
 */

import { StudentTopicMastery } from "../models/StudentTopicMastery.js"
import {
  aggregateGrammarMasteries,
  aggregateVocabularyMasteries,
  aggregateAcademicVocabularyMasteries,
} from "./topicMastery.service.js"
import { estimateIeltsBand } from "./ieltsEstimation.service.js"
import { buildIeltsRecommendations } from "./ieltsRecommendationEngine.service.js"
import { ALL_TOPIC_CATALOGUE, getTopicById } from "../config/ielts-topic-catalogue.js"

/**
 * Compute all topic masteries from language profile raw data.
 */
export function computeAllTopicMasteries(
  studentId,
  orgId,
  { grammarTopicStats = [], vocabTopicStats = [], grammarTopicAccumulators = new Map(), deckMap = new Map() },
  now = new Date(),
) {
  const grammar = aggregateGrammarMasteries(
    studentId,
    orgId,
    grammarTopicStats,
    grammarTopicAccumulators,
    now,
  )
  const vocabulary = aggregateVocabularyMasteries(studentId, orgId, vocabTopicStats, now)
  const academic = aggregateAcademicVocabularyMasteries(
    studentId,
    orgId,
    vocabTopicStats,
    deckMap,
    now,
  )

  return [...grammar, ...vocabulary, ...academic]
}

/**
 * Bulk upsert topic mastery records.
 */
export async function persistTopicMasteries(records) {
  if (!records.length) return []

  const ops = records.map((r) => {
    const { _components, ...doc } = r
    return {
      updateOne: {
        filter: { studentId: doc.studentId, topicId: doc.topicId },
        update: { $set: doc },
        upsert: true,
      },
    }
  })

  await StudentTopicMastery.bulkWrite(ops, { ordered: false })
  return records.map(({ _components, ...r }) => r)
}

/**
 * Full IELTS language profile computation.
 */
export function buildIeltsLanguageProfile(topicMasteries, skillProfiles) {
  const estimation = estimateIeltsBand({ topicMasteries, skillProfiles })
  const recommendation = buildIeltsRecommendations(estimation, topicMasteries)

  return {
    topicMasteries: topicMasteries.map(({ _components, ...r }) => r),
    cefrProfile: estimation.cefrProfile,
    grammarCefrProfile: estimation.grammarCefrProfile,
    vocabularyCefrProfile: estimation.vocabularyCefrProfile,
    ieltsEstimation: {
      estimatedBand: estimation.estimatedBand,
      potentialBand: estimation.potentialBand,
      confidence: estimation.confidence,
      strengths: estimation.strengths,
      weaknesses: estimation.weaknesses,
      limitingFactors: estimation.limitingFactors,
      componentBands: estimation.componentBands,
    },
    ieltsRecommendation: recommendation,
  }
}

/**
 * Get topic catalogue for API (public metadata).
 */
export function getTopicCatalogue() {
  return ALL_TOPIC_CATALOGUE.map((t) => ({
    id: t.id,
    name: t.name,
    level: t.level,
    minBand: t.minBand,
    ceilingBand: t.ceilingBand,
    weight: t.weight,
    category: t.category,
    isCritical: t.isCritical ?? false,
  }))
}

/**
 * Load persisted topic masteries for a student.
 */
export async function getStudentTopicMasteries(studentId, opts = {}) {
  const filter = { studentId }
  if (opts.category) filter.category = opts.category
  return StudentTopicMastery.find(filter).sort({ cefrLevel: 1, topicId: 1 }).lean()
}

import { resolveCatalogueTopicId } from "../config/ielts-topic-catalogue.js"

/**
 * Enrich grammar topic stats with masteryScore for UI.
 */
export function enrichTopicsWithMastery(topicStats, topicMasteries) {
  const masteryById = new Map(topicMasteries.map((m) => [m.topicId, m]))
  return topicStats.map((t) => {
    const catalogueId = resolveCatalogueTopicId(t.slug, "grammar")
    const m = masteryById.get(catalogueId) ?? masteryById.get(t.slug)
    return {
      ...t,
      masteryScore: m?.masteryScore ?? 0,
      masteryStatus: m?.masteryStatus ?? "not_mastered",
    }
  })
}

export { getTopicById }
