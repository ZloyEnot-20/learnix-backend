import { Submission } from "../models/Submission.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { User } from "../models/User.js"
import { ACTIVE_STUDENT_FILTER } from "./student.service.js"
import {
  MAX_LEVEL,
  POINTS,
  levelFromPoints,
} from "../config/level-thresholds.js"
import { aggregateLearnPoints, aggregateLearnPointsBatch } from "./vocabulary-progress.service.js"
import { EXCLUDE_CHEATING_HOMEWORK_MATCH } from "./submission.service.js"

/** Level → rank tiers. Max level 30 = Legend (single level). */
export const TIERS = [
  { id: "bronze", label: "Bronze", minLevel: 1, maxLevel: 5 },
  { id: "silver", label: "Silver", minLevel: 6, maxLevel: 10 },
  { id: "gold", label: "Gold", minLevel: 11, maxLevel: 20 },
  { id: "diamond", label: "Diamond", minLevel: 21, maxLevel: 29 },
  { id: "legend", label: "Legend", minLevel: 30, maxLevel: 30 },
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

function computeLearnPoints({ reviewCorrect, quizCorrect, masteredCount, deckCompleteBonus }) {
  return (
    reviewCorrect * POINTS.WORD_REVIEW_CORRECT +
    quizCorrect * POINTS.VOCAB_QUIZ_CORRECT +
    masteredCount * POINTS.WORD_MASTERED +
    deckCompleteBonus * POINTS.VOCAB_DECK_COMPLETE
  )
}

function buildLevelSummary(homeworkPoints, exercisePoints, learnPoints, completedHomework) {
  const totalPoints = homeworkPoints + exercisePoints + learnPoints
  const { level, isMaxLevel, pointsIntoLevel, pointsForNextLevel, pointsToNextLevel } =
    levelFromPoints(totalPoints)
  const tier = tierForLevel(level)

  const unlockedCefrLevels = Object.entries(CEFR_LEVEL_REQUIREMENT)
    .filter(([, required]) => level >= required)
    .map(([cefr]) => cefr)

  return {
    totalPoints,
    level,
    maxLevel: MAX_LEVEL,
    isMaxLevel,
    tier: tier.id,
    tierLabel: tier.label,
    levelName: `${tier.label} · Lvl ${level}`,
    pointsIntoLevel,
    pointsForNextLevel,
    pointsToNextLevel,
    breakdown: { homeworkPoints, exercisePoints, learnPoints, completedHomework },
    requirements: CEFR_LEVEL_REQUIREMENT,
    unlockedCefrLevels,
  }
}

/** Compute the full progress/level summary for a student from their activity. */
export async function computeStudentLevel(studentId) {
  const [homeworkAgg, exerciseAgg, learnRaw] = await Promise.all([
    Submission.aggregate([
      {
        $match: {
          studentId,
          status: { $in: ["submitted", "graded"] },
          ...EXCLUDE_CHEATING_HOMEWORK_MATCH,
        },
      },
      {
        $group: {
          _id: null,
          completedHomework: { $sum: 1 },
          correctSum: { $sum: { $ifNull: ["$attempt.correctCount", 0] } },
        },
      },
    ]),
    ExerciseEvent.aggregate([
      { $match: { studentId } },
      {
        $group: {
          _id: null,
          correctSum: { $sum: { $ifNull: ["$correctCount", 0] } },
        },
      },
    ]),
    aggregateLearnPoints(studentId),
  ])

  const homeworkRow = homeworkAgg[0]
  const exerciseRow = exerciseAgg[0]
  const completedHomework = homeworkRow?.completedHomework ?? 0
  const homeworkPoints =
    completedHomework * POINTS.HOMEWORK_COMPLETION +
    (homeworkRow?.correctSum ?? 0) * POINTS.HOMEWORK_CORRECT
  const exercisePoints = (exerciseRow?.correctSum ?? 0) * POINTS.EXERCISE_CORRECT
  const learnPoints = computeLearnPoints(learnRaw)

  return buildLevelSummary(homeworkPoints, exercisePoints, learnPoints, completedHomework)
}

/** Org-wide student ranking by derived XP (top N). */
export async function computeOrgLeaderboard(orgId, limit = 30) {
  const students = await User.find({ orgId, type: "student", ...ACTIVE_STUDENT_FILTER })
    .select("_id name avatarUrl")
    .lean()
  if (students.length === 0) return []

  const studentIds = students.map((s) => s._id)
  const nameById = new Map(students.map((s) => [s._id, s.name]))
  const avatarById = new Map(students.map((s) => [s._id, s.avatarUrl ?? null]))

  const [homeworkAgg, exerciseAgg, learnByStudent] = await Promise.all([
    Submission.aggregate([
      {
        $match: {
          orgId,
          studentId: { $in: studentIds },
          status: { $in: ["submitted", "graded"] },
          ...EXCLUDE_CHEATING_HOMEWORK_MATCH,
        },
      },
      {
        $group: {
          _id: "$studentId",
          submissions: { $sum: 1 },
          correctSum: { $sum: { $ifNull: ["$attempt.correctCount", 0] } },
        },
      },
    ]),
    ExerciseEvent.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: "$studentId",
          correctSum: { $sum: { $ifNull: ["$correctCount", 0] } },
        },
      },
    ]),
    aggregateLearnPointsBatch(studentIds),
  ])

  const pointsByStudent = new Map(
    studentIds.map((id) => [
      id,
      { homeworkPoints: 0, exercisePoints: 0, learnPoints: 0 },
    ]),
  )

  for (const row of homeworkAgg) {
    const cur = pointsByStudent.get(row._id)
    if (!cur) continue
    cur.homeworkPoints =
      row.submissions * POINTS.HOMEWORK_COMPLETION + row.correctSum * POINTS.HOMEWORK_CORRECT
  }

  for (const row of exerciseAgg) {
    const cur = pointsByStudent.get(row._id)
    if (!cur) continue
    cur.exercisePoints = row.correctSum * POINTS.EXERCISE_CORRECT
  }

  for (const [id, learnRaw] of learnByStudent) {
    const cur = pointsByStudent.get(id)
    if (!cur) continue
    cur.learnPoints = computeLearnPoints(learnRaw)
  }

  const entries = studentIds.map((id) => {
    const { homeworkPoints, exercisePoints, learnPoints } = pointsByStudent.get(id) ?? {
      homeworkPoints: 0,
      exercisePoints: 0,
      learnPoints: 0,
    }
    const totalPoints = homeworkPoints + exercisePoints + learnPoints
    const { level } = levelFromPoints(totalPoints)
    const tier = tierForLevel(level)
    return {
      studentId: id,
      name: nameById.get(id) ?? "Student",
      avatarUrl: avatarById.get(id) ?? null,
      totalPoints,
      level,
      tier: tier.id,
      tierLabel: tier.label,
    }
  })

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    return a.name.localeCompare(b.name)
  })

  return entries.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry,
  }))
}
