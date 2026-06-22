import { Submission } from "../models/Submission.js"
import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { User } from "../models/User.js"
import { ACTIVE_STUDENT_FILTER } from "./student.service.js"

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

/** Org-wide student ranking by derived XP (top N). */
export async function computeOrgLeaderboard(orgId, limit = 30) {
  const students = await User.find({ orgId, type: "student", ...ACTIVE_STUDENT_FILTER })
    .select("_id name avatarUrl")
    .lean()
  if (students.length === 0) return []

  const studentIds = students.map((s) => s._id)
  const nameById = new Map(students.map((s) => [s._id, s.name]))
  const avatarById = new Map(students.map((s) => [s._id, s.avatarUrl ?? null]))

  const [homeworkAgg, exerciseAgg] = await Promise.all([
    Submission.aggregate([
      {
        $match: {
          orgId,
          studentId: { $in: studentIds },
          status: { $in: ["submitted", "graded"] },
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
  ])

  const pointsByStudent = new Map(
    studentIds.map((id) => [id, { homeworkPoints: 0, exercisePoints: 0 }]),
  )

  for (const row of homeworkAgg) {
    const cur = pointsByStudent.get(row._id)
    if (!cur) continue
    cur.homeworkPoints =
      row.submissions * HOMEWORK_COMPLETION_POINTS + row.correctSum * POINTS_PER_HOMEWORK_CORRECT
  }

  for (const row of exerciseAgg) {
    const cur = pointsByStudent.get(row._id)
    if (!cur) continue
    cur.exercisePoints = row.correctSum * POINTS_PER_EXERCISE_CORRECT
  }

  const entries = studentIds.map((id) => {
    const { homeworkPoints, exercisePoints } = pointsByStudent.get(id) ?? {
      homeworkPoints: 0,
      exercisePoints: 0,
    }
    const totalPoints = homeworkPoints + exercisePoints
    const level = Math.floor(totalPoints / POINTS_PER_LEVEL) + 1
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
