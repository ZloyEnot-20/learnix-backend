import { LessonSession } from "../models/LessonSession.js"
import { findStudentIdsInGroup } from "./group.service.js"
import { withOrgId } from "./tenantScope.service.js"

export function formatDateOnly(date) {
  const d = new Date(date)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function monthRange(month) {
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("month must be YYYY-MM")
  }
  const [year, m] = month.split("-").map(Number)
  const from = new Date(Date.UTC(year, m - 1, 1))
  const to = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999))
  return { from, to }
}

/** Calendar dates in month matching group lessonWeekdays (0 = Sun … 6 = Sat). */
export function scheduledDatesInMonth(year, month, weekdays) {
  if (!weekdays?.length) return []
  const dates = []
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (weekdays.includes(date.getUTCDay())) dates.push(date)
  }
  return dates
}

export function buildAttendance(studentIds, existing = []) {
  const byStudent = new Map(existing.map((row) => [row.studentId, row]))
  return studentIds.map((studentId) => {
    const prev = byStudent.get(studentId)
    return {
      studentId,
      ...(prev?.status ? { status: prev.status } : {}),
      notes: prev?.notes ?? undefined,
    }
  })
}

function isPristineScheduledLesson(lesson) {
  if (lesson.canceled || lesson.cancelReason?.trim()) return false
  if (lesson.attendanceMarked) return false
  if (lesson.topic?.trim() || lesson.notes?.trim()) return false
  for (const row of lesson.attendance ?? []) {
    if (row.status && row.status !== "present") return false
    if (row.notes?.trim()) return false
  }
  return true
}

/**
 * Remove auto-created lessons that no longer match the group schedule.
 * Lessons with saved attendance/topic are kept as one-off extras.
 */
export async function pruneOrphanedScheduledLessons(group, { month } = {}) {
  const weekdays = group.lessonWeekdays ?? []
  const weekdaySet = new Set(weekdays)

  const filter = {
    groupId: group._id,
    orgId: group.orgId,
  }
  if (month) {
    const { from, to } = monthRange(month)
    filter.date = { $gte: from, $lte: to }
  }

  const lessons = await LessonSession.find(filter)
  const deleteIds = []

  for (const lesson of lessons) {
    const weekday = new Date(lesson.date).getUTCDay()
    if (weekdaySet.has(weekday)) continue

    const scheduled = lesson.fromSchedule === true
    const legacyAuto = lesson.fromSchedule !== true && isPristineScheduledLesson(lesson)
    if (!scheduled && !legacyAuto) {
      continue
    }

    if (isPristineScheduledLesson(lesson)) {
      deleteIds.push(lesson._id)
    } else if (scheduled) {
      await LessonSession.updateOne({ _id: lesson._id }, { $set: { fromSchedule: false } })
    }
  }

  if (deleteIds.length) {
    await LessonSession.deleteMany({ _id: { $in: deleteIds } })
  }
}

export async function syncScheduledLessons(group, month, req) {
  const weekdays = group.lessonWeekdays
  if (!weekdays?.length) return

  const [year, m] = month.split("-").map(Number)
  const { from, to } = monthRange(month)
  const studentIds = await findStudentIdsInGroup(group._id)

  const existing = await LessonSession.find({
    groupId: group._id,
    orgId: group.orgId,
    date: { $gte: from, $lte: to },
  }).select("date")

  const existingDates = new Set(existing.map((row) => formatDateOnly(row.date)))

  for (const date of scheduledDatesInMonth(year, m, weekdays)) {
    const key = formatDateOnly(date)
    if (existingDates.has(key)) continue
    try {
      await LessonSession.create(
        withOrgId(req, {
          groupId: group._id,
          date,
          fromSchedule: true,
          attendance: buildAttendance(studentIds),
        }),
      )
      existingDates.add(key)
    } catch {
      // duplicate from concurrent request — safe to ignore
    }
  }
}
