import { TestResult } from "../models/TestResult.js"
import { Submission } from "../models/Submission.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { ControlWork } from "../models/ControlWork.js"
import { Homework } from "../models/Homework.js"
import { EntryTest } from "../models/EntryTest.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { buildStudentSummary } from "./activity.service.js"

const IELTS_SKILLS = ["reading", "listening", "writing", "speaking"]

function roundBand(value) {
  return Math.round(value * 2) / 2
}

function avg(nums) {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function computeTrend(scores) {
  if (scores.length < 2) return "stable"
  const last2 = scores.slice(-2)
  const prev2 = scores.length >= 4 ? scores.slice(-4, -2) : scores.slice(0, -2)
  if (!prev2.length) return "stable"
  const lastAvg = avg(last2)
  const prevAvg = avg(prev2)
  if (lastAvg == null || prevAvg == null) return "stable"
  const delta = lastAvg - prevAvg
  if (delta >= 0.25) return "up"
  if (delta <= -0.25) return "down"
  return "stable"
}

function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function buildRecommendation({
  readinessStatus,
  targetBand,
  overallBand,
  skills,
  confidence,
  cheatingIncidents,
  mockTestCount,
  daysToExam,
  estimatedReadyDate,
  targetExamDate,
}) {
  if (cheatingIncidents > 0) {
    return "Integrity issues detected — review homework sessions before relying on scores."
  }
  if (!targetBand) {
    return "Set a target band to enable readiness tracking."
  }
  if (mockTestCount < 3) {
    return "Insufficient mock test data — assign at least one full mock per skill."
  }
  if (readinessStatus === "ready") {
    return "Student meets the target band across assessed skills — ready for IELTS."
  }
  const belowTarget = skills.filter((s) => s.estimatedBand != null && s.belowTarget)
  if (belowTarget.length) {
    const weakest = belowTarget.reduce((a, b) =>
      (a.estimatedBand ?? 0) < (b.estimatedBand ?? 0) ? a : b,
    )
    const gap = roundBand(targetBand - (weakest.estimatedBand ?? 0))
    const label = weakest.skill.charAt(0).toUpperCase() + weakest.skill.slice(1)
    return `${label} is ${gap.toFixed(1)} band below target — focus mock ${weakest.skill} before exam.`
  }
  if (readinessStatus === "on_track" && estimatedReadyDate && targetExamDate) {
    const readyDays = daysBetween(new Date(), new Date(estimatedReadyDate))
    const examDays = daysToExam ?? 0
    if (readyDays < examDays) {
      return `On track: projected ready ${Math.max(0, examDays - readyDays)} days before exam date.`
    }
  }
  if (readinessStatus === "at_risk") {
    return "At risk — exam is approaching and the student is still below target."
  }
  if (confidence === "low") {
    return "Not enough recent activity — encourage regular mock tests and homework."
  }
  if (overallBand != null && targetBand != null && overallBand < targetBand) {
    const gap = roundBand(targetBand - overallBand)
    return `Overall band is ${gap.toFixed(1)} below target — increase practice frequency.`
  }
  return "Continue regular practice across all four skills."
}

async function loadHomeworkScoresBySkill(studentId) {
  const [subs, homeworkList] = await Promise.all([
    Submission.find({ studentId }).lean(),
    Homework.find().select("_id subject").lean(),
  ])
  const hwById = new Map(homeworkList.map((h) => [h._id, h]))
  const bySkill = {}
  for (const skill of IELTS_SKILLS) bySkill[skill] = []

  for (const sub of subs) {
    if (!sub.score || !["submitted", "graded"].includes(sub.status)) continue
    const hw = hwById.get(sub.homeworkId)
    const subject = sub.subject ?? hw?.subject
    if (subject && IELTS_SKILLS.includes(subject)) {
      bySkill[subject].push(sub.score)
    }
  }
  return bySkill
}

async function loadControlWorkScoresBySkill(studentId) {
  const [subs, works] = await Promise.all([
    ControlWorkSubmission.find({ studentId, status: { $in: ["submitted", "graded"] } }).lean(),
    ControlWork.find().select("_id steps").lean(),
  ])
  const cwById = new Map(works.map((w) => [w._id, w]))
  const bySkill = {}
  for (const skill of IELTS_SKILLS) bySkill[skill] = []

  for (const sub of subs) {
    const cw = cwById.get(sub.controlWorkId)
    if (!cw?.steps?.length || sub.score == null) continue
    const subjects = [...new Set(cw.steps.map((s) => s.subject).filter((s) => IELTS_SKILLS.includes(s)))]
    for (const subject of subjects) {
      bySkill[subject].push(sub.score)
    }
  }
  return bySkill
}

function estimateSkill(skill, mockResults, hwScores, cwScores, targetBand) {
  const mockForSkill = mockResults
    .filter((t) => t.testType === skill && typeof t.bandScore === "number")
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const mockBands = mockForSkill.map((t) => t.bandScore)
  let estimatedBand = null
  let source = "none"
  let attempts = 0
  let lastBand = null

  if (mockBands.length) {
    const recent = mockBands.slice(0, 3)
    estimatedBand = roundBand(avg(recent))
    source = "mock_test"
    attempts = mockBands.length
    lastBand = mockBands[0]
  } else {
    const hw = hwScores[skill] ?? []
    const cw = cwScores[skill] ?? []
    const combined = [...hw, ...cw]
    if (combined.length) {
      estimatedBand = roundBand(avg(combined))
      source = "homework"
      attempts = combined.length
      lastBand = combined[combined.length - 1]
    }
  }

  const trend = mockBands.length ? computeTrend([...mockBands].reverse()) : "stable"
  const belowTarget =
    targetBand != null && estimatedBand != null && estimatedBand < targetBand

  return {
    skill,
    estimatedBand,
    source,
    attempts,
    lastBand,
    trend,
    belowTarget,
  }
}

function computeMonthlyGain(mockResults) {
  const withBand = mockResults
    .filter((t) => typeof t.bandScore === "number")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  if (withBand.length < 2) return 0.25

  const first = withBand[0]
  const last = withBand[withBand.length - 1]
  const months =
    Math.max(
      1,
      (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24 * 30),
    )
  const gain = (last.bandScore - first.bandScore) / months
  if (gain > 0) return Math.max(gain, 0.1)
  return 0.25
}

function computeReadiness({
  targetBand,
  targetExamDate,
  overallBand,
  skills,
  estimatedReadyDate,
  recentActivityCount,
}) {
  if (!targetBand || recentActivityCount < 2) {
    return "insufficient_data"
  }

  const skillsWithData = skills.filter((s) => s.estimatedBand != null)
  if (
    skillsWithData.length === IELTS_SKILLS.length &&
    skillsWithData.every((s) => s.estimatedBand >= targetBand)
  ) {
    return "ready"
  }

  const gap = overallBand != null ? targetBand - overallBand : null
  const daysToExam = targetExamDate ? daysBetween(new Date(), new Date(targetExamDate)) : null

  if (daysToExam != null && daysToExam <= 21) {
    const anySkillGap = skills.some(
      (s) => s.estimatedBand != null && targetBand - s.estimatedBand > 1.0,
    )
    if ((gap != null && gap > 0.5) || anySkillGap) {
      return "at_risk"
    }
  }

  if (
    estimatedReadyDate &&
    targetExamDate &&
    new Date(estimatedReadyDate) <= new Date(targetExamDate)
  ) {
    return "on_track"
  }

  if (gap != null && gap <= 0) {
    return "ready"
  }

  return "not_ready"
}

/**
 * Build full IELTS profile for a student (teacher dashboard).
 */
export async function buildIeltsProfile(student) {
  const studentId = student._id ?? student.id
  const targetBand = student.targetBand ?? null
  const targetExamDate = student.targetExamDate ?? null

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [summary, testResults, hwScores, cwScores, entryTest, recentActivityCount] =
    await Promise.all([
      buildStudentSummary(studentId),
      TestResult.find({ studentId }).sort({ date: -1 }).lean(),
      loadHomeworkScoresBySkill(studentId),
      loadControlWorkScoresBySkill(studentId),
      EntryTest.findOne({ studentId, status: "graded" }).sort({ assignedAt: -1 }).lean(),
      StudentActivity.countDocuments({ studentId, at: { $gte: thirtyDaysAgo } }),
    ])

  const skills = IELTS_SKILLS.map((skill) =>
    estimateSkill(skill, testResults, hwScores, cwScores, targetBand),
  )

  const bandsWithData = skills.map((s) => s.estimatedBand).filter((b) => b != null)
  const overallBand = bandsWithData.length ? roundBand(avg(bandsWithData)) : null
  const gapToTarget =
    targetBand != null && overallBand != null ? roundBand(targetBand - overallBand) : null

  const mockTestCount = testResults.filter((t) => typeof t.bandScore === "number").length
  const monthlyGain = computeMonthlyGain(testResults)
  let estimatedReadyDate = null
  let confidence = "low"

  if (mockTestCount >= 3 && gapToTarget != null && gapToTarget > 0) {
    const monthsNeeded = gapToTarget / monthlyGain
    estimatedReadyDate = addMonths(new Date(), monthsNeeded)
    confidence = mockTestCount >= 6 ? "high" : "medium"
  } else if (mockTestCount >= 1 && recentActivityCount >= 2) {
    confidence = "medium"
  }

  const daysToExam = targetExamDate
    ? daysBetween(new Date(), new Date(targetExamDate))
    : null

  const readinessStatus = computeReadiness({
    targetBand,
    targetExamDate,
    overallBand,
    skills,
    estimatedReadyDate,
    recentActivityCount,
  })

  const ieltsSubjects = summary.bySubject.filter((s) => IELTS_SKILLS.includes(s.subject))
  const avgAccuracy =
    ieltsSubjects.length && ieltsSubjects.some((s) => s.accuracy != null)
      ? Math.round(
          ieltsSubjects
            .filter((s) => s.accuracy != null)
            .reduce((a, s) => a + s.accuracy, 0) /
            ieltsSubjects.filter((s) => s.accuracy != null).length,
        )
      : null

  const ieltsHw = (summary.homework.assignments ?? []).filter((a) =>
    IELTS_SKILLS.includes(a.subject ?? a.topic ?? ""),
  )
  const ieltsAssigned = ieltsHw.length
  const ieltsCompleted = ieltsHw.filter((a) =>
    ["submitted", "graded"].includes(a.status),
  ).length
  const completionRate =
    ieltsAssigned > 0 ? Math.round((ieltsCompleted / ieltsAssigned) * 100) : null

  const weakestTopics = (summary.grammarByTopic ?? [])
    .filter((t) => t.accuracy != null)
    .slice(0, 3)
    .map((t) => ({ topic: t.topic, accuracy: t.accuracy }))

  const bandHistory = testResults
    .filter((t) => typeof t.bandScore === "number")
    .map((t) => ({
      date: t.date,
      skill: t.testType,
      band: t.bandScore,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  const recommendation = buildRecommendation({
    readinessStatus,
    targetBand,
    overallBand,
    skills,
    confidence,
    cheatingIncidents: summary.integrity.cheatingIncidents,
    mockTestCount,
    daysToExam,
    estimatedReadyDate,
    targetExamDate,
  })

  return {
    targetBand,
    targetExamDate: targetExamDate ? new Date(targetExamDate).toISOString() : null,
    overallBand,
    gapToTarget,
    readinessStatus,
    estimatedReadyDate: estimatedReadyDate ? estimatedReadyDate.toISOString() : null,
    confidence,
    daysToExam,
    skills,
    learningHealth: {
      completionRate,
      avgAccuracy,
      cheatingIncidents: summary.integrity.cheatingIncidents,
      weakestTopics,
      entryLevel: entryTest?.overallLevel ?? null,
    },
    bandHistory,
    recommendation,
  }
}

/** Compact summary for students list table. */
export async function buildIeltsSummaries(students) {
  const results = await Promise.all(
    students.map(async (student) => {
      const profile = await buildIeltsProfile(student)
      return {
        studentId: student._id ?? student.id,
        overallBand: profile.overallBand,
        readinessStatus: profile.readinessStatus,
        targetExamDate: profile.targetExamDate,
        targetBand: profile.targetBand,
      }
    }),
  )
  return results
}
