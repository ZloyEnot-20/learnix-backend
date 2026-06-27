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

/** Level → rank tiers. Max level 30 = Legend (single level).
 *  Tier entry (~homework-only): Silver L6 ≈ 50, Gold L11 ≈ 250, Diamond L21 ≈ 750. */
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

function homeworkPointsFromAgg(row) {
  const completedHomework = row?.completedHomework ?? row?.submissions ?? 0
  const correctSum = row?.correctSum ?? 0
  return {
    completedHomework,
    homeworkPoints:
      completedHomework * POINTS.HOMEWORK_COMPLETION + correctSum * POINTS.HOMEWORK_CORRECT,
  }
}

function totalAndLevel(homeworkPoints, exercisePoints, learnPoints) {
  const totalPoints = homeworkPoints + exercisePoints + learnPoints
  const { level } = levelFromPoints(totalPoints)
  return { totalPoints, level }
}

async function persistGamificationFields(studentId, fields) {
  await User.updateOne({ _id: studentId, type: "student" }, { $set: fields })
}

/** Recompute totalPoints and level from the three breakdown fields on User. */
export async function refreshStudentTotalAndLevel(studentId) {
  const user = await User.findOne({ _id: studentId, type: "student" })
    .select("homeworkPoints exercisePoints learnPoints completedHomework")
    .lean()
  if (!user) return null

  const homeworkPoints = user.homeworkPoints ?? 0
  const exercisePoints = user.exercisePoints ?? 0
  const learnPoints = user.learnPoints ?? 0
  const { totalPoints, level } = totalAndLevel(homeworkPoints, exercisePoints, learnPoints)

  await persistGamificationFields(studentId, {
    totalPoints,
    level,
    homeworkPoints,
    exercisePoints,
    learnPoints,
    completedHomework: user.completedHomework ?? 0,
  })

  return {
    homeworkPoints,
    exercisePoints,
    learnPoints,
    completedHomework: user.completedHomework ?? 0,
    totalPoints,
    level,
  }
}

/** Apply incremental point deltas (append-only activity). */
export async function applyStudentPointsDelta(
  studentId,
  { homeworkPoints = 0, exercisePoints = 0, learnPoints = 0, completedHomework = 0 } = {},
) {
  if (
    !studentId ||
    (homeworkPoints === 0 &&
      exercisePoints === 0 &&
      learnPoints === 0 &&
      completedHomework === 0)
  ) {
    return null
  }

  const user = await User.findOneAndUpdate(
    { _id: studentId, type: "student" },
    {
      $inc: {
        homeworkPoints,
        exercisePoints,
        learnPoints,
        completedHomework,
      },
    },
    { new: true },
  )
    .select("homeworkPoints exercisePoints learnPoints completedHomework")
    .lean()

  if (!user) return null
  return refreshStudentTotalAndLevel(studentId)
}

/** Recompute homework slice from submissions (handles resubmits with new scores). */
export async function recomputeHomeworkGamification(studentId) {
  const homeworkAgg = await Submission.aggregate([
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
  ])

  const { homeworkPoints, completedHomework } = homeworkPointsFromAgg(homeworkAgg[0])
  await persistGamificationFields(studentId, { homeworkPoints, completedHomework })
  return refreshStudentTotalAndLevel(studentId)
}

/** Recompute learn slice from vocabulary aggregates. */
export async function recomputeLearnGamification(studentId) {
  const learnRaw = await aggregateLearnPoints(studentId)
  const learnPoints = computeLearnPoints(learnRaw)
  await persistGamificationFields(studentId, { learnPoints })
  return refreshStudentTotalAndLevel(studentId)
}

/** Recompute exercise slice from exercise events. */
export async function recomputeExerciseGamification(studentId) {
  const exerciseAgg = await ExerciseEvent.aggregate([
    { $match: { studentId } },
    {
      $group: {
        _id: null,
        correctSum: { $sum: { $ifNull: ["$correctCount", 0] } },
      },
    },
  ])
  const exercisePoints = (exerciseAgg[0]?.correctSum ?? 0) * POINTS.EXERCISE_CORRECT
  await persistGamificationFields(studentId, { exercisePoints })
  return refreshStudentTotalAndLevel(studentId)
}

/** Full recompute from activity collections and persist on User. */
export async function recomputeStudentGamification(studentId) {
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

  const { homeworkPoints, completedHomework } = homeworkPointsFromAgg(homeworkAgg[0])
  const exercisePoints = (exerciseAgg[0]?.correctSum ?? 0) * POINTS.EXERCISE_CORRECT
  const learnPoints = computeLearnPoints(learnRaw)
  const { totalPoints, level } = totalAndLevel(homeworkPoints, exercisePoints, learnPoints)

  await persistGamificationFields(studentId, {
    homeworkPoints,
    exercisePoints,
    learnPoints,
    completedHomework,
    totalPoints,
    level,
  })

  return {
    homeworkPoints,
    exercisePoints,
    learnPoints,
    completedHomework,
    totalPoints,
    level,
  }
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

function summaryFromUser(user) {
  const homeworkPoints = user.homeworkPoints ?? 0
  const exercisePoints = user.exercisePoints ?? 0
  const learnPoints = user.learnPoints ?? 0
  const completedHomework = user.completedHomework ?? 0
  return buildLevelSummary(homeworkPoints, exercisePoints, learnPoints, completedHomework)
}

/** Read stored gamification from User; recompute once if not yet migrated. */
export async function computeStudentLevel(studentId) {
  let user = await User.findOne({ _id: studentId, type: "student" })
    .select("totalPoints level homeworkPoints exercisePoints learnPoints completedHomework")
    .lean()

  if (!user) {
    return buildLevelSummary(0, 0, 0, 0)
  }

  if (user.totalPoints == null) {
    const stored = await recomputeStudentGamification(studentId)
    return buildLevelSummary(
      stored.homeworkPoints,
      stored.exercisePoints,
      stored.learnPoints,
      stored.completedHomework,
    )
  }

  return summaryFromUser(user)
}

/** Org-wide student ranking from stored User gamification fields (top N). */
export async function computeOrgLeaderboard(orgId, limit = 30) {
  const students = await User.find({ orgId, type: "student", ...ACTIVE_STUDENT_FILTER })
    .select("_id name avatarUrl totalPoints level homeworkPoints exercisePoints learnPoints")
    .sort({ totalPoints: -1, name: 1 })
    .limit(limit)
    .lean()

  if (students.length === 0) return []

  const unmigrated = students.filter((s) => s.totalPoints == null)
  if (unmigrated.length > 0) {
    await Promise.all(unmigrated.map((s) => recomputeStudentGamification(s._id)))
    return computeOrgLeaderboard(orgId, limit)
  }

  return students.map((student, index) => {
    const level = student.level ?? levelFromPoints(student.totalPoints ?? 0).level
    const tier = tierForLevel(level)
    return {
      rank: index + 1,
      studentId: student._id,
      name: student.name ?? "Student",
      avatarUrl: student.avatarUrl ?? null,
      totalPoints: student.totalPoints ?? 0,
      level,
      tier: tier.id,
      tierLabel: tier.label,
    }
  })
}

/** Batch backfill for migration scripts. */
export async function recomputeStudentGamificationBatch(studentIds) {
  const [homeworkAgg, exerciseAgg, learnByStudent] = await Promise.all([
    Submission.aggregate([
      {
        $match: {
          studentId: { $in: studentIds },
          status: { $in: ["submitted", "graded"] },
          ...EXCLUDE_CHEATING_HOMEWORK_MATCH,
        },
      },
      {
        $group: {
          _id: "$studentId",
          completedHomework: { $sum: 1 },
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

  const homeworkByStudent = new Map(homeworkAgg.map((row) => [row._id, row]))
  const exerciseByStudent = new Map(exerciseAgg.map((row) => [row._id, row]))

  const ops = studentIds.map((studentId) => {
    const { homeworkPoints, completedHomework } = homeworkPointsFromAgg(
      homeworkByStudent.get(studentId),
    )
    const exercisePoints =
      (exerciseByStudent.get(studentId)?.correctSum ?? 0) * POINTS.EXERCISE_CORRECT
    const learnPoints = computeLearnPoints(
      learnByStudent.get(studentId) ?? {
        reviewCorrect: 0,
        quizCorrect: 0,
        masteredCount: 0,
        deckCompleteBonus: 0,
      },
    )
    const { totalPoints, level } = totalAndLevel(homeworkPoints, exercisePoints, learnPoints)

    return {
      updateOne: {
        filter: { _id: studentId, type: "student" },
        update: {
          $set: {
            homeworkPoints,
            exercisePoints,
            learnPoints,
            completedHomework,
            totalPoints,
            level,
          },
        },
      },
    }
  })

  if (ops.length > 0) {
    await User.bulkWrite(ops, { ordered: false })
  }
}
