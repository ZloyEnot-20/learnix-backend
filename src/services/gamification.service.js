import { Submission } from "../models/Submission.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"

/**
 * Gamification rules. Points are DERIVED from existing activity (completed
 * homework + finished exercise/game attempts) so they cannot be inflated by
 * replaying a client request — there is no stored, mutable balance.
 */
export const POINTS_PER_LEVEL = 100
const HOMEWORK_COMPLETION_POINTS = 50
const POINTS_PER_HOMEWORK_CORRECT = 5
const POINTS_PER_EXERCISE_CORRECT = 10

/** Level → rank tiers. Each tier covers an inclusive range of levels. */
export const TIERS = [
  { id: "bronze", label: "Bronze", minLevel: 1, maxLevel: 5 },
  { id: "silver", label: "Silver", minLevel: 6, maxLevel: 10 },
  { id: "gold", label: "Gold", minLevel: 11, maxLevel: 20 },
  { id: "diamond", label: "Diamond", minLevel: 21, maxLevel: 30 },
  { id: "master", label: "Master", minLevel: 31, maxLevel: Infinity },
]

/** Minimum student level required to unlock each CEFR folder. */
export const CEFR_LEVEL_REQUIREMENT = {
  A1: 1,
  A2: 3,
  B1: 6,
  B2: 11,
  C1: 16,
  C2: 21,
}

export function tierForLevel(level) {
  return TIERS.find((t) => level >= t.minLevel && level <= t.maxLevel) ?? TIERS[0]
}

/** Compute the full progress/level summary for a student from their activity. */
export async function computeStudentLevel(studentId) {
  const [submissions, events] = await Promise.all([
    Submission.find({
      studentId,
      status: { $in: ["submitted", "graded"] },
    }).lean(),
    ExerciseEvent.find({ studentId }).lean(),
  ])

  let homeworkPoints = 0
  for (const s of submissions) {
    homeworkPoints += HOMEWORK_COMPLETION_POINTS
    homeworkPoints += (s.attempt?.correctCount ?? 0) * POINTS_PER_HOMEWORK_CORRECT
  }

  let exercisePoints = 0
  for (const e of events) {
    exercisePoints += (e.correctCount ?? 0) * POINTS_PER_EXERCISE_CORRECT
  }

  const totalPoints = homeworkPoints + exercisePoints
  const level = Math.floor(totalPoints / POINTS_PER_LEVEL) + 1
  const tier = tierForLevel(level)
  const pointsIntoLevel = totalPoints % POINTS_PER_LEVEL
  const pointsForNextLevel = POINTS_PER_LEVEL

  const unlockedCefrLevels = Object.entries(CEFR_LEVEL_REQUIREMENT)
    .filter(([, required]) => level >= required)
    .map(([cefr]) => cefr)

  return {
    totalPoints,
    level,
    tier: tier.id,
    tierLabel: tier.label,
    levelName: `${tier.label} · Lvl ${level}`,
    pointsIntoLevel,
    pointsForNextLevel,
    pointsToNextLevel: pointsForNextLevel - pointsIntoLevel,
    breakdown: { homeworkPoints, exercisePoints, completedHomework: submissions.length },
    requirements: CEFR_LEVEL_REQUIREMENT,
    unlockedCefrLevels,
  }
}
