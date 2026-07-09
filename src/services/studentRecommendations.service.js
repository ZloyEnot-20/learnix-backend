import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { recencyWeight, topicLevelWeight } from "../config/language-profile.js"

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const MAX_RECOMMENDATIONS = 5

function clamp01(n) {
  return Math.max(0, Math.min(1, n))
}

function topicUrgencyScore(topic, now = new Date()) {
  const acc = typeof topic.weightedAccuracy === "number" ? topic.weightedAccuracy : 0
  const conf = typeof topic.confidence === "number" ? topic.confidence : 0
  const level = typeof topic.learnixLevel === "number" ? topic.learnixLevel : 5

  const accBad = clamp01((75 - acc) / 75) // 0 at 75%+, 1 at 0%
  const confBad = clamp01(1 - conf)
  const difficulty = clamp01((topicLevelWeight(level) - 1) / 1.6) // ~0..1 across 1..9

  const lastAt = topic.lastAttemptAt ?? topic.lastSuccessAt ?? topic.firstAttemptAt
  const recent = lastAt ? recencyWeight(lastAt, now) : 0.3

  // Needs review dominates; otherwise balance accuracy/confidence with difficulty and recency.
  const needsReviewBoost = topic.needsReview ? 1 : 0
  return (
    needsReviewBoost * 2.0 +
    accBad * 1.2 +
    confBad * 0.9 +
    difficulty * 0.6 +
    recent * 0.4
  )
}

function scoreToPriority(score) {
  if (score >= 2.2) return "high"
  if (score >= 1.4) return "medium"
  return "low"
}

/**
 * Build up to 5 prioritized recommendations from a persisted language profile.
 * @param {object} profile — StudentLanguageProfile document
 */
export function buildRecommendations(profile) {
  const recs = []
  const seen = new Set()

  function push(rec) {
    const key = rec.type === "review_topic" || rec.type === "practice_topic"
      ? `${rec.type}:${rec.topic}`
      : rec.type
    if (seen.has(key)) return
    seen.add(key)
    recs.push(rec)
  }

  const grammarTopics = profile.grammar?.topics ?? []
  const vocabTopics = profile.vocabulary?.topics ?? []
  const now = new Date()

  const topicCandidates = []
  for (const topic of grammarTopics) {
    if ((topic.attemptedQuestions ?? 0) < 3) continue
    if (topic.needsReview) {
      topicCandidates.push({ skill: "grammar", type: "review_topic", topic })
    } else if (!topic.mastered && (topic.confidence ?? 0) < 0.7) {
      topicCandidates.push({ skill: "grammar", type: "practice_topic", topic })
    }
  }
  for (const topic of vocabTopics) {
    if ((topic.attemptedQuestions ?? 0) < 3) continue
    if (topic.needsReview) {
      topicCandidates.push({ skill: "vocabulary", type: "review_topic", topic })
    } else if (!topic.mastered && (topic.confidence ?? 0) < 0.7) {
      topicCandidates.push({ skill: "vocabulary", type: "practice_topic", topic })
    }
  }

  topicCandidates
    .map((c) => ({
      ...c,
      urgency: topicUrgencyScore(c.topic, now),
    }))
    .sort((a, b) => b.urgency - a.urgency)
    .slice(0, 10) // compute more, then dedupe + cap later
    .forEach((c) => {
      const acc = typeof c.topic.weightedAccuracy === "number" ? Math.round(c.topic.weightedAccuracy) : 0
      const conf = typeof c.topic.confidence === "number" ? Math.round(c.topic.confidence * 100) : 0
      push({
        type: c.type,
        skill: c.skill,
        topic: c.topic.slug,
        title: c.topic.title ?? c.topic.slug,
        priority: scoreToPriority(c.urgency),
        reason: `${acc}% accuracy · ${conf}% confidence · L${c.topic.learnixLevel ?? "?"}`,
      })
    })

  if (profile.vocabulary?.hasData && (profile.vocabulary.score ?? 0) < 550) {
    push({
      type: "increase_vocabulary",
      priority: profile.vocabulary.score < 400 ? "high" : "medium",
      reason: `Vocabulary score ${profile.vocabulary.score}`,
    })
  }

  const fluency = profile.speaking?.dimensions?.fluency ?? 0
  if (profile.speaking?.hasData && fluency > 0 && fluency < 600) {
    push({
      type: "improve_fluency",
      priority: fluency < 450 ? "high" : "medium",
      reason: `Fluency dimension ${fluency}`,
    })
  }

  const pronunciation = profile.speaking?.dimensions?.pronunciation ?? 0
  if (profile.speaking?.hasData && pronunciation > 0 && pronunciation < 600) {
    push({
      type: "improve_pronunciation",
      priority: pronunciation < 450 ? "medium" : "low",
      reason: `Pronunciation dimension ${pronunciation}`,
    })
  }

  return recs
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, MAX_RECOMMENDATIONS)
}

/**
 * Suggest homework exercises/decks based on recommendations (no auto-assign).
 */
export async function buildHomeworkCandidates(profile, recommendations) {
  const candidates = []
  const topicRecs = recommendations.filter(
    (r) => r.type === "review_topic" || r.type === "practice_topic",
  )

  const grammarSlugs = new Set()
  const vocabSlugs = new Set()

  for (const rec of topicRecs) {
    if (rec.skill === "grammar" && rec.topic) {
      const exercises = await Exercise.find({ topic: rec.topic, category: "grammar" })
        .select("slug title topic level difficulty totalQuestions")
        .sort({ difficulty: 1 })
        .limit(3)
        .lean()

      for (const ex of exercises) {
        if (grammarSlugs.has(ex.slug)) continue
        grammarSlugs.add(ex.slug)
        candidates.push({
          kind: "grammar",
          subject: "grammar",
          exerciseSlug: ex.slug,
          title: ex.title,
          topic: ex.topic,
          level: ex.level,
          difficulty: ex.difficulty,
          totalQuestions: ex.totalQuestions,
          priority: rec.priority,
          reason: rec.reason ?? rec.type,
        })
      }
    }

    if (rec.skill === "vocabulary" && rec.topic) {
      if (vocabSlugs.has(rec.topic)) continue
      const deck = await VocabDeck.findById(rec.topic).select("slug title level").lean()
      if (!deck) continue
      vocabSlugs.add(rec.topic)
      candidates.push({
        kind: "vocabulary",
        subject: "vocabulary",
        exerciseSlug: `vocab:${deck.slug}`,
        title: deck.title,
        topic: deck.slug,
        level: deck.level,
        priority: rec.priority,
        reason: rec.reason ?? rec.type,
      })
    }
  }

  if (
    recommendations.some((r) => r.type === "increase_vocabulary") &&
    candidates.filter((c) => c.kind === "vocabulary").length < 2
  ) {
    const decks = await VocabDeck.find()
      .select("slug title level")
      .sort({ order: 1 })
      .limit(2)
      .lean()
    for (const deck of decks) {
      if (vocabSlugs.has(deck.slug)) continue
      candidates.push({
        kind: "vocabulary",
        subject: "vocabulary",
        exerciseSlug: `vocab:${deck.slug}`,
        title: deck.title,
        topic: deck.slug,
        level: deck.level,
        priority: "medium",
        reason: "Expand vocabulary practice",
      })
    }
  }

  return candidates
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 10)
}
