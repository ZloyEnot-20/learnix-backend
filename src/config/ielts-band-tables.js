/**
 * Official Cambridge IELTS Academic band conversion tables (correct answers → band).
 * Used when scoring listening/reading homework and feeding StudentLanguageProfile.
 */

const LISTENING_BAND_TABLE = [
  { min: 39, max: 40, band: 9.0 },
  { min: 37, max: 38, band: 8.5 },
  { min: 35, max: 36, band: 8.0 },
  { min: 32, max: 34, band: 7.5 },
  { min: 30, max: 31, band: 7.0 },
  { min: 26, max: 29, band: 6.5 },
  { min: 23, max: 25, band: 6.0 },
  { min: 18, max: 22, band: 5.5 },
  { min: 16, max: 17, band: 5.0 },
  { min: 13, max: 15, band: 4.5 },
  { min: 10, max: 12, band: 4.0 },
  { min: 0, max: 9, band: 3.5 },
]

const READING_BAND_TABLE = [
  { min: 39, max: 40, band: 9.0 },
  { min: 37, max: 38, band: 8.5 },
  { min: 35, max: 36, band: 8.0 },
  { min: 33, max: 34, band: 7.5 },
  { min: 30, max: 32, band: 7.0 },
  { min: 27, max: 29, band: 6.5 },
  { min: 23, max: 26, band: 6.0 },
  { min: 19, max: 22, band: 5.5 },
  { min: 15, max: 18, band: 5.0 },
  { min: 13, max: 14, band: 4.5 },
  { min: 10, max: 12, band: 4.0 },
  { min: 0, max: 9, band: 3.5 },
]

function lookupBand(table, correct) {
  const n = Math.max(0, Math.round(Number(correct) || 0))
  return table.find((range) => n >= range.min && n <= range.max)?.band ?? 0
}

/** Scale correct answers to a /40 basis when the test is not exactly 40 questions. */
function scaleToForty(correct, total) {
  if (!total || total <= 0) return 0
  if (total === 40) return Math.max(0, Math.min(40, correct))
  return Math.round((correct / total) * 40)
}

export function listeningBandScore(correct) {
  return lookupBand(LISTENING_BAND_TABLE, correct)
}

export function readingBandScore(correct) {
  return lookupBand(READING_BAND_TABLE, correct)
}

/**
 * Band for an IELTS-style attempt. Uses Cambridge tables when question count is
 * in the typical full-test range; otherwise falls back to a linear 0–9 estimate.
 */
export function cambridgeBandFromAttempt(skill, total, correct) {
  if (!total || total <= 0) return undefined
  const scaled = scaleToForty(correct ?? 0, total)
  if (total >= 30) {
    if (skill === "listening") return listeningBandScore(scaled)
    if (skill === "reading") return readingBandScore(scaled)
  }
  return Math.round(((correct ?? 0) / total) * 9 * 2) / 2
}

/**
 * IELTS band → Learnix score (0–1000).
 * Inverse of front-end learnixScoreToIeltsBand (band 4 → 0, band 9 → 1000).
 */
export function ieltsBandToLearnixScore(band) {
  if (band == null || Number.isNaN(Number(band))) return 0
  const clamped = Math.max(0, Math.min(9, Number(band)))
  return Math.round(Math.max(0, Math.min(1000, ((clamped - 4) / 5) * 1000)))
}

/** Confidence from number of graded IELTS attempts (homework + mocks). */
export function ieltsSkillConfidenceFromAttempts(count) {
  if (!count || count <= 0) return 0
  return Math.min(1, count / 5)
}
