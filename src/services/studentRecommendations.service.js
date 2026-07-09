import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
const MAX_RECOMMENDATIONS = 5

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

  for (const topic of grammarTopics) {
    if (!topic.needsReview) continue
    push({
      type: "review_topic",
      skill: "grammar",
      topic: topic.slug,
      title: topic.title ?? topic.slug,
      priority:
        topic.weightedAccuracy < 50
          ? "high"
          : topic.weightedAccuracy < 65
            ? "medium"
            : "low",
      reason: `Accuracy ${topic.weightedAccuracy}%`,
    })
  }

  for (const topic of vocabTopics) {
    if (!topic.needsReview) continue
    push({
      type: "review_topic",
      skill: "vocabulary",
      topic: topic.slug,
      title: topic.title ?? topic.slug,
      priority:
        topic.weightedAccuracy < 50
          ? "high"
          : topic.weightedAccuracy < 65
            ? "medium"
            : "low",
      reason: `Accuracy ${topic.weightedAccuracy}%`,
    })
  }

  for (const topic of grammarTopics) {
    if (topic.mastered || topic.confidence >= 0.7) continue
    if ((topic.attemptedQuestions ?? 0) < 3) continue
    push({
      type: "practice_topic",
      skill: "grammar",
      topic: topic.slug,
      title: topic.title ?? topic.slug,
      priority: topic.confidence < 0.4 ? "high" : "medium",
      reason: `Low confidence (${Math.round(topic.confidence * 100)}%)`,
    })
  }

  for (const topic of vocabTopics) {
    if (topic.mastered || topic.confidence >= 0.7) continue
    if ((topic.attemptedQuestions ?? 0) < 3) continue
    push({
      type: "practice_topic",
      skill: "vocabulary",
      topic: topic.slug,
      title: topic.title ?? topic.slug,
      priority: topic.confidence < 0.4 ? "high" : "medium",
      reason: `Low confidence (${Math.round(topic.confidence * 100)}%)`,
    })
  }

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
