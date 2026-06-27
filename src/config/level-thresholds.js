/**
 * Non-linear level curve anchored to homework milestones.
 * Level is derived from cumulative points — never floor(points / N) + 1.
 * Max level is 30 (Legend tier).
 *
 * Tier transitions (homework-only baseline at 50 pts/completion):
 *   Silver  → level  6 ≈  50 homework
 *   Gold    → level 11 ≈ 250 homework
 *   Diamond → level 21 ≈ 750 homework
 *   Legend  → level 30 (unchanged final jump)
 */

export const MAX_LEVEL = 30

/** Points awarded per activity (stored on User, updated on activity). */
export const POINTS = {
  HOMEWORK_COMPLETION: 50,
  HOMEWORK_CORRECT: 5,
  EXERCISE_CORRECT: 3,
  VOCAB_QUIZ_CORRECT: 2,
  VOCAB_DECK_COMPLETE: 15,
  WORD_REVIEW_CORRECT: 1,
  WORD_MASTERED: 8,
}

/** Approximate completed homework to reach each tier (completion points only). */
export const TIER_HOMEWORK = {
  silver: 50,
  gold: 250,
  diamond: 750,
}

const CURVE_POWER = 1.85
const JUMP_29_TO_30 = 375_000
const LEGEND_LEVEL_29_POINTS = 110_000

function interpolatePoints(fromLevel, fromPoints, toLevel, toPoints, level) {
  const span = toLevel - fromLevel
  const t = (level - fromLevel) / span
  return Math.round(fromPoints + (toPoints - fromPoints) * t ** CURVE_POWER)
}

function buildThresholds() {
  const hw = POINTS.HOMEWORK_COMPLETION
  const anchors = [
    { level: 1, points: 0 },
    { level: 6, points: TIER_HOMEWORK.silver * hw },
    { level: 11, points: TIER_HOMEWORK.gold * hw },
    { level: 21, points: TIER_HOMEWORK.diamond * hw },
    { level: 29, points: LEGEND_LEVEL_29_POINTS },
  ]

  const thresholds = [0]

  for (let a = 0; a < anchors.length - 1; a++) {
    const from = anchors[a]
    const to = anchors[a + 1]
    for (let level = from.level + 1; level <= to.level; level++) {
      thresholds.push(interpolatePoints(from.level, from.points, to.level, to.points, level))
    }
  }

  thresholds.push(thresholds[28] + JUMP_29_TO_30)
  return thresholds
}

/** Cumulative points required to REACH each level (index 0 = level 1 at 0 pts). */
export const LEVEL_THRESHOLDS = buildThresholds()

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
