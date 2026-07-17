/**
 * IELTS Estimation Service
 *
 * Pipeline: Topic Mastery → CEFR Profile → IELTS Band Estimate
 *
 * Does NOT use raw accuracy % as IELTS band.
 * Applies band ceiling logic when skill scores exceed grammar/vocab readiness.
 */

import {
  IELTS_SKILL_WEIGHTS,
  MASTERY_SCORE_MASTERED,
  getCriticalTopics,
  getTopicById,
  roundIeltsBand,
  CEFR_LEVELS,
} from "../config/ielts-topic-catalogue.js"
import { buildCombinedCefrProfile, bandFromCefrProgress } from "./cefrProfile.service.js"

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/** Learnix score (0–1000) → IELTS band (4.0–9.0, step 0.5). */
export function learnixScoreToIeltsBand(score) {
  const clamped = Math.max(0, Math.min(1000, score))
  const raw = 4 + (clamped / 1000) * 5
  return Math.round(raw * 2) / 2
}

/**
 * Convert Learnix skill score (0–1000) to IELTS band.
 */
export function skillScoreToIeltsBand(score) {
  if (score == null || score <= 0) return null
  return learnixScoreToIeltsBand(score)
}

/**
 * Grammar-based band from CEFR profile progression rules.
 */
export function grammarBandFromCefr(grammarCefrProfile) {
  return bandFromCefrProgress(grammarCefrProfile)
}

/**
 * Vocabulary-based band from vocabulary CEFR profile.
 */
export function vocabularyBandFromCefr(vocabCefrProfile) {
  return bandFromCefrProgress(vocabCefrProfile)
}

/**
 * Academic vocabulary band — stricter thresholds.
 */
export function academicVocabBandFromMasteries(academicMasteries) {
  if (!academicMasteries?.length) return null
  const withData = academicMasteries.filter((m) => (m.attemptedQuestions ?? 0) > 0)
  if (!withData.length) return null

  let sum = 0
  let w = 0
  for (const m of withData) {
    const topic = getTopicById(m.topicId)
    const tw = topic?.weight ?? 1
    sum += (m.masteryScore ?? 0) * tw
    w += tw
  }
  const avgMastery = w > 0 ? sum / w : 0

  if (avgMastery >= 80) return 7.5
  if (avgMastery >= 65) return 7.0
  if (avgMastery >= 50) return 6.5
  if (avgMastery >= 35) return 6.0
  if (avgMastery >= 20) return 5.5
  return 5.0
}

/**
 * Apply band ceiling from unmastered critical topics.
 * @returns {{ ceilingBand: number, limitingFactors: string[] }}
 */
export function applyBandCeiling(potentialBand, topicMasteries, skillBands = {}) {
  const limitingFactors = []
  let ceiling = potentialBand

  // CEFR progression ceiling from combined profile
  const { combined } = buildCombinedCefrProfile(topicMasteries)
  const progressionCeiling = bandFromCefrProgress(combined)
  if (progressionCeiling < ceiling) {
    ceiling = progressionCeiling
    limitingFactors.push(`CEFR progression caps at Band ${progressionCeiling}`)
  }

  // Critical topic ceiling
  const criticalTopics = getCriticalTopics()
  for (const topic of criticalTopics) {
    const mastery = topicMasteries.find((m) => m.topicId === topic.id)
    const score = mastery?.masteryScore ?? 0
    if (score < MASTERY_SCORE_MASTERED) {
      if (topic.ceilingBand < ceiling) {
        ceiling = topic.ceilingBand
      }
      limitingFactors.push(topic.name)
    }
  }

  // If reading/listening high but grammar low — enforce ceiling
  const readingBand = skillBands.reading
  const listeningBand = skillBands.listening
  const skillAvg =
    readingBand != null && listeningBand != null
      ? (readingBand + listeningBand) / 2
      : readingBand ?? listeningBand ?? null

  if (skillAvg != null && skillAvg > ceiling + 0.5) {
    // Skill scores suggest higher band but knowledge base doesn't support it
    const grammarCeiling = bandFromCefrProgress(
      buildCombinedCefrProfile(topicMasteries).grammar,
    )
    if (grammarCeiling < skillAvg) {
      ceiling = Math.min(ceiling, grammarCeiling + 0.5)
      if (!limitingFactors.some((f) => f.includes("grammar readiness"))) {
        limitingFactors.push("Grammar/vocabulary readiness below Reading/Listening performance")
      }
    }
  }

  return {
    ceilingBand: roundIeltsBand(ceiling),
    limitingFactors: [...new Set(limitingFactors)],
  }
}

/**
 * Identify strengths and weaknesses from topic masteries and skill bands.
 */
export function identifyStrengthsWeaknesses(topicMasteries, skillBands, cefrProfile) {
  const strengths = []
  const weaknesses = []

  for (const level of CEFR_LEVELS) {
    const pct = cefrProfile[level] ?? 0
    if (pct >= 80) strengths.push(`${level} grammar & vocabulary (${pct}%)`)
    else if (pct > 0 && pct < 50) weaknesses.push(`${level} level (${pct}% mastery)`)
  }

  for (const [skill, band] of Object.entries(skillBands)) {
    if (band == null) continue
    if (band >= 7) strengths.push(`${skill.charAt(0).toUpperCase() + skill.slice(1)} Band ${band}`)
    else if (band < 6) weaknesses.push(`${skill.charAt(0).toUpperCase() + skill.slice(1)} Band ${band}`)
  }

  const unmasteredCritical = getCriticalTopics().filter((t) => {
    const m = topicMasteries.find((r) => r.topicId === t.id)
    return (m?.masteryScore ?? 0) < MASTERY_SCORE_MASTERED
  })
  for (const t of unmasteredCritical.slice(0, 5)) {
    weaknesses.push(`${t.name} not mastered`)
  }

  return {
    strengths: strengths.slice(0, 6),
    weaknesses: weaknesses.slice(0, 6),
  }
}

/**
 * Compute overall confidence 0–100.
 */
export function computeEstimationConfidence(topicMasteries, skillProfiles) {
  let confSum = 0
  let count = 0

  for (const m of topicMasteries) {
    if ((m.attemptedQuestions ?? 0) > 0) {
      confSum += m.confidenceScore ?? 0
      count += 1
    }
  }

  for (const skill of ["grammar", "vocabulary", "reading", "listening", "speaking", "writing"]) {
    const p = skillProfiles[skill]
    if (p?.hasData && (p.confidence ?? 0) > 0) {
      confSum += p.confidence
      count += 1
    }
  }

  const avg = count > 0 ? confSum / count : 0
  return Math.round(avg * 100)
}

/**
 * Main IELTS estimation entry point.
 *
 * @param {object} input
 * @param {Array} input.topicMasteries
 * @param {object} input.skillProfiles — grammar, vocabulary, reading, listening, writing, speaking
 */
export function estimateIeltsBand(input) {
  const { topicMasteries = [], skillProfiles = {} } = input

  const { combined, grammar, vocabulary } = buildCombinedCefrProfile(topicMasteries)

  const grammarBand = grammarBandFromCefr(grammar)
  const vocabularyBand = vocabularyBandFromCefr(vocabulary)
  const academicMasteries = topicMasteries.filter((m) => m.category === "academic_vocabulary")
  const academicBand = academicVocabBandFromMasteries(academicMasteries)

  const skillBands = {
    reading: skillProfiles.reading?.hasData
      ? skillScoreToIeltsBand(skillProfiles.reading.score)
      : null,
    listening: skillProfiles.listening?.hasData
      ? skillScoreToIeltsBand(skillProfiles.listening.score)
      : null,
    writing: skillProfiles.writing?.hasData
      ? skillScoreToIeltsBand(skillProfiles.writing.score)
      : null,
    speaking: skillProfiles.speaking?.hasData
      ? skillScoreToIeltsBand(skillProfiles.speaking.score)
      : null,
  }

  // Weighted combination of all inputs
  const components = []
  const weights = IELTS_SKILL_WEIGHTS

  if (grammarBand != null) components.push({ band: grammarBand, weight: weights.grammar, source: "grammar" })
  if (vocabularyBand != null) components.push({ band: vocabularyBand, weight: weights.vocabulary, source: "vocabulary" })
  if (academicBand != null) components.push({ band: academicBand, weight: weights.academicVocabulary, source: "academic" })
  if (skillBands.reading != null) components.push({ band: skillBands.reading, weight: weights.reading, source: "reading" })
  if (skillBands.listening != null) components.push({ band: skillBands.listening, weight: weights.listening, source: "listening" })
  if (skillBands.writing != null) components.push({ band: skillBands.writing, weight: weights.writing, source: "writing" })
  if (skillBands.speaking != null) components.push({ band: skillBands.speaking, weight: weights.speaking, source: "speaking" })

  let potentialBand = 5.0
  if (components.length) {
    const wSum = components.reduce((a, c) => a + c.weight, 0)
    potentialBand = components.reduce((a, c) => a + c.band * c.weight, 0) / wSum
  }

  const { ceilingBand, limitingFactors } = applyBandCeiling(
    potentialBand,
    topicMasteries,
    skillBands,
  )

  const estimatedBand = roundIeltsBand(Math.min(potentialBand, ceilingBand))
  const confidence = computeEstimationConfidence(topicMasteries, skillProfiles)
  const { strengths, weaknesses } = identifyStrengthsWeaknesses(
    topicMasteries,
    skillBands,
    combined,
  )

  return {
    estimatedBand,
    potentialBand: roundIeltsBand(potentialBand),
    confidence,
    strengths,
    weaknesses,
    limitingFactors,
    cefrProfile: combined,
    grammarCefrProfile: grammar,
    vocabularyCefrProfile: vocabulary,
    componentBands: {
      grammar: grammarBand,
      vocabulary: vocabularyBand,
      academicVocabulary: academicBand,
      ...skillBands,
    },
    components,
  }
}
