/**
 * CEFR Profile Service
 *
 * Builds CEFR-level mastery percentages from topic mastery records.
 *
 * Formula per CEFR level L:
 *   cefrProfile[L] = Σ(masteryScore × topicWeight × cefrLevelWeight) / Σ(topicWeight × cefrLevelWeight)
 *
 * where topicWeight = topic.weight (default 1)
 *       cefrLevelWeight from CEFR_LEVEL_WEIGHTS
 */

import {
  CEFR_LEVELS,
  CEFR_LEVEL_WEIGHTS,
  GRAMMAR_TOPIC_CATALOGUE,
  VOCABULARY_TOPIC_CATALOGUE,
  ACADEMIC_VOCABULARY_CATALOGUE,
  BAND_PROGRESSION_RULES,
  getTopicById,
} from "../config/ielts-topic-catalogue.js"

function emptyCefrProfile() {
  return Object.fromEntries(CEFR_LEVELS.map((l) => [l, 0]))
}

/**
 * @param {Array<{ topicId: string, masteryScore: number, category?: string }>} topicMasteries
 * @param {object} [opts]
 * @param {string[]} [opts.categories] — filter by category
 * @param {boolean} [opts.includeZeroDataTopics] — count catalogue topics with 0 score in denominator
 */
export function buildCefrProfile(topicMasteries, opts = {}) {
  const categories = opts.categories ?? ["grammar", "vocabulary", "academic_vocabulary"]
  const includeZero = opts.includeZeroDataTopics ?? true

  const profile = emptyCefrProfile()
  const topicByLevel = Object.fromEntries(CEFR_LEVELS.map((l) => [l, []]))

  for (const m of topicMasteries) {
    const topic = getTopicById(m.topicId)
    if (!topic) continue
    if (!categories.includes(topic.category)) continue
    topicByLevel[topic.level].push({ ...m, topic })
  }

  if (includeZero) {
    const allCatalogue = [
      ...GRAMMAR_TOPIC_CATALOGUE,
      ...VOCABULARY_TOPIC_CATALOGUE,
      ...ACADEMIC_VOCABULARY_CATALOGUE,
    ]
    for (const topic of allCatalogue) {
      if (!categories.includes(topic.category)) continue
      const hasData = topicByLevel[topic.level].some((m) => m.topicId === topic.id)
      if (!hasData) {
        topicByLevel[topic.level].push({ topicId: topic.id, masteryScore: 0, topic })
      }
    }
  }

  for (const level of CEFR_LEVELS) {
    const items = topicByLevel[level]
    if (!items.length) {
      profile[level] = 0
      continue
    }

    let weightedSum = 0
    let weightTotal = 0
    const cefrWeight = CEFR_LEVEL_WEIGHTS[level] ?? 1

    for (const item of items) {
      const tw = item.topic?.weight ?? 1
      const w = tw * cefrWeight
      weightedSum += (item.masteryScore ?? 0) * w
      weightTotal += w
    }

    profile[level] = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0
  }

  return profile
}

export function buildGrammarCefrProfile(topicMasteries) {
  return buildCefrProfile(topicMasteries, { categories: ["grammar"] })
}

export function buildVocabularyCefrProfile(topicMasteries) {
  return buildCefrProfile(topicMasteries, {
    categories: ["vocabulary", "academic_vocabulary"],
  })
}

/**
 * Max IELTS band confirmed by CEFR progression rules.
 * @param {Record<string, number>} cefrProfile — { A1: 100, A2: 92, ... }
 */
export function bandFromCefrProgress(cefrProfile) {
  for (const rule of BAND_PROGRESSION_RULES) {
    const reqs = rule.requirements ?? {}
    const met = Object.entries(reqs).every(([level, minPct]) => (cefrProfile[level] ?? 0) >= minPct)
    if (met) return rule.band
  }
  return 4.0
}

export function buildCombinedCefrProfile(topicMasteries) {
  const grammar = buildGrammarCefrProfile(topicMasteries)
  const vocabulary = buildVocabularyCefrProfile(topicMasteries)

  const combined = emptyCefrProfile()
  for (const level of CEFR_LEVELS) {
    combined[level] = Math.round(grammar[level] * 0.6 + vocabulary[level] * 0.4)
  }
  return { combined, grammar, vocabulary }
}
