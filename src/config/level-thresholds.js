/**
 * Non-linear level curve. Level is derived from cumulative points — never
 * floor(points / N) + 1. Max level is 30 (Legend tier).
 */

export const MAX_LEVEL = 30

/** Cumulative points required to REACH each level (index 0 = level 1 at 0 pts). */
const SMOOTH_TARGET_AT_28 = 35_000
const JUMP_28_TO_29 = 75_000
const JUMP_29_TO_30 = 375_000

function buildThresholds() {
  const thresholds = [0]
  for (let level = 2; level <= 28; level++) {
    const t = (level - 1) / 27
    thresholds.push(Math.round(SMOOTH_TARGET_AT_28 * t ** 1.85))
  }
  thresholds.push(thresholds[27] + JUMP_28_TO_29)
  thresholds.push(thresholds[28] + JUMP_29_TO_30)
  return thresholds
}

export const LEVEL_THRESHOLDS = buildThresholds()

/** Points awarded per activity (derived — never stored as a balance). */
export const POINTS = {
  HOMEWORK_COMPLETION: 50,
  HOMEWORK_CORRECT: 5,
  EXERCISE_CORRECT: 3,
  VOCAB_QUIZ_CORRECT: 2,
  VOCAB_DECK_COMPLETE: 15,
  WORD_REVIEW_CORRECT: 1,
  WORD_MASTERED: 8,
}

export const MASTERY_CORRECT_THRESHOLD = 5

/**
 * @param {number} totalPoints
 * @returns {{ level: number, isMaxLevel: boolean, pointsIntoLevel: number, pointsForNextLevel: number, pointsToNextLevel: number }}
 */
export function levelFromPoints(totalPoints) {
  let level = 1
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) {
      level = i + 1
      break
    }
  }
  level = Math.min(level, MAX_LEVEL)
  const isMaxLevel = level >= MAX_LEVEL

  const currentThreshold = LEVEL_THRESHOLDS[level - 1] ?? 0
  const nextThreshold = isMaxLevel ? currentThreshold : LEVEL_THRESHOLDS[level]
  const pointsForNextLevel = isMaxLevel ? 0 : nextThreshold - currentThreshold
  const pointsIntoLevel = isMaxLevel ? 0 : totalPoints - currentThreshold
  const pointsToNextLevel = isMaxLevel ? 0 : Math.max(0, nextThreshold - totalPoints)

  return { level, isMaxLevel, pointsIntoLevel, pointsForNextLevel, pointsToNextLevel }
}
