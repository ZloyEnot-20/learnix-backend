import { StudentLanguageProfileSnapshot } from "../models/StudentLanguageProfileSnapshot.js"

export const SNAPSHOT_SCORE_THRESHOLD = 5
export const SNAPSHOT_MIN_DAYS = 7

/**
 * Whether a new snapshot should be persisted.
 * @param {object|null} previousSnapshot — latest snapshot doc
 * @param {object} newProfile — freshly computed profile
 */
export function shouldSaveSnapshot(previousSnapshot, newProfile) {
  if (!previousSnapshot) return true

  const now = Date.now()
  const lastAt = new Date(previousSnapshot.createdAt).getTime()
  const daysSince = (now - lastAt) / (1000 * 60 * 60 * 24)
  if (daysSince >= SNAPSHOT_MIN_DAYS) return true

  const diffs = [
    Math.abs((newProfile.grammar?.score ?? 0) - (previousSnapshot.grammarScore ?? 0)),
    Math.abs((newProfile.vocabulary?.score ?? 0) - (previousSnapshot.vocabularyScore ?? 0)),
    Math.abs((newProfile.speaking?.score ?? 0) - (previousSnapshot.speakingScore ?? 0)),
    Math.abs((newProfile.overall?.score ?? 0) - (previousSnapshot.overallScore ?? 0)),
  ]

  return diffs.some((d) => d > SNAPSHOT_SCORE_THRESHOLD)
}

/**
 * Persist a snapshot if thresholds are met.
 * @returns {object|null} created snapshot or null
 */
export async function maybeSaveProfileSnapshot(studentId, orgId, profile) {
  const last = await StudentLanguageProfileSnapshot.findOne({ studentId })
    .sort({ createdAt: -1 })
    .lean()

  if (!shouldSaveSnapshot(last, profile)) return null

  return StudentLanguageProfileSnapshot.create({
    studentId,
    orgId,
    grammarScore: profile.grammar?.score ?? 0,
    vocabularyScore: profile.vocabulary?.score ?? 0,
    speakingScore: profile.speaking?.score ?? 0,
    overallScore: profile.overall?.score ?? 0,
    grammarLevel: profile.grammar?.level ?? 1,
    vocabularyLevel: profile.vocabulary?.level ?? 1,
    speakingLevel: profile.speaking?.level ?? 1,
    createdAt: new Date(),
  })
}

/** Progress history for charts — up to 52 weekly points per skill. */
export async function getProfileScoreHistory(studentId, limit = 52) {
  const snapshots = await StudentLanguageProfileSnapshot.find({ studentId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean()

  const grammar = []
  const vocabulary = []
  const speaking = []
  const overall = []

  for (const s of snapshots) {
    const point = { date: s.createdAt, score: 0, level: 1 }
    grammar.push({ ...point, score: s.grammarScore, level: s.grammarLevel })
    vocabulary.push({ ...point, score: s.vocabularyScore, level: s.vocabularyLevel })
    speaking.push({ ...point, score: s.speakingScore, level: s.speakingLevel })
    overall.push({ ...point, score: s.overallScore, level: 0 })
  }

  return { grammar, vocabulary, speaking, overall }
}
