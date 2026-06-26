import { LessonSession } from "../models/LessonSession.js"

import { asyncHandler } from "../utils/asyncHandler.js"

import { ApiError } from "../utils/ApiError.js"

import { recordAudit } from "../services/audit.service.js"

import { findStudentIdsInGroup } from "../services/group.service.js"

import { notify } from "../services/notification.service.js"

import {

  assertOrgGroup,

  assertTenantDoc,

  tenantFilter,

  withOrgId,

} from "../services/tenantScope.service.js"

import {

  buildAttendance,

  formatDateOnly,

  monthRange,

  pruneOrphanedScheduledLessons,

  syncScheduledLessons,

} from "../services/lesson-schedule.service.js"



function parseDateOnly(value) {

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {

    throw ApiError.badRequest("date must be YYYY-MM-DD")

  }

  const [year, month, day] = value.trim().split("-").map(Number)

  return new Date(Date.UTC(year, month - 1, day))

}



function serializeLesson(doc) {

  const json = doc.toJSON()

  json.date = formatDateOnly(doc.date)

  return json

}



function attendanceRowsToNotify(previousAttendance, nextAttendance) {
  const oldByStudent = new Map(
    (previousAttendance ?? []).map((row) => [row.studentId, row.status ?? null]),
  )
  return (nextAttendance ?? []).filter((row) => {
    if (!row?.studentId || !row.status) return false
    return oldByStudent.get(row.studentId) !== row.status
  })
}



async function notifyAttendanceChanges({
  group,
  lessonDate,
  topic,
  canceled,
  previousAttendance,
  nextAttendance,
}) {
  const rows = attendanceRowsToNotify(previousAttendance, nextAttendance)
  if (rows.length === 0) return

  const lessonDateLabel = formatDateOnly(lessonDate)
  const topicLabel = topic?.trim() || undefined

  await Promise.all(
    rows.map((row) =>
      notify(row.studentId, {
        type: "attendance",
        title: `Attendance: ${row.status}`,
        message: `Lesson on ${lessonDateLabel}: ${row.status}`,
        data: {
          status: row.status,
          lessonDate: lessonDateLabel,
          topic: topicLabel,
          groupName: group?.name,
          canceled: canceled === true,
        },
      }).catch(() => {}),
    ),
  )
}



export const listLessons = asyncHandler(async (req, res) => {

  const { groupId, month } = req.query

  if (!groupId) throw ApiError.badRequest("groupId is required")

  const group = await assertOrgGroup(groupId, req)



  if (month) {

    await pruneOrphanedScheduledLessons(group, { month })

    await syncScheduledLessons(group, month, req)

  }



  const filter = { ...tenantFilter(req), groupId }

  if (month) {

    const { from, to } = monthRange(month)

    filter.date = { $gte: from, $lte: to }

  }



  const lessons = await LessonSession.find(filter).sort({ date: -1 })

  res.json(lessons.map(serializeLesson))

})



export const getLesson = asyncHandler(async (req, res) => {

  const lesson = await assertTenantDoc(LessonSession, req.params.id, req)

  res.json(serializeLesson(lesson))

})



export const createLesson = asyncHandler(async (req, res) => {

  const { groupId, date, topic, notes } = req.body

  const group = await assertOrgGroup(groupId, req)

  const lessonDate = parseDateOnly(date)

  const studentIds = await findStudentIdsInGroup(group._id)



  const existing = await LessonSession.findOne({

    groupId: group._id,

    orgId: group.orgId,

    date: lessonDate,

  })

  if (existing) throw ApiError.conflict("A lesson already exists for this date")



  const lesson = await LessonSession.create(

    withOrgId(req, {

      groupId: group._id,

      date: lessonDate,

      topic: topic?.trim() || undefined,

      notes: notes?.trim() || undefined,

      attendance: buildAttendance(studentIds),

    }),

  )



  await recordAudit({

    req,

    action: "create",

    category: "lessons",

    targetType: "lesson",

    targetId: lesson._id,

    targetLabel: formatDateOnly(lesson.date),

    details: { groupId: group._id, groupName: group.name },

  })



  res.status(201).json(serializeLesson(lesson))

})



export const updateLesson = asyncHandler(async (req, res) => {

  const lesson = await assertTenantDoc(LessonSession, req.params.id, req)

  const group = await assertOrgGroup(lesson.groupId, req)

  let attendanceNotifyPayload = null



  const patch = {}

  if (req.body.topic !== undefined) patch.topic = req.body.topic?.trim() || undefined

  if (req.body.notes !== undefined) patch.notes = req.body.notes?.trim() || undefined

  if (req.body.canceled !== undefined) {
    if (req.body.canceled === true) {
      const reason = req.body.cancelReason?.trim()
      if (!reason) throw ApiError.badRequest("Comment is required when canceling a lesson")
      patch.canceled = true
      patch.cancelReason = reason
      const studentIds = await findStudentIdsInGroup(lesson.groupId)
      patch.attendance = buildAttendance(
        studentIds,
        studentIds.map((studentId) => ({ studentId, status: "excused" })),
      )
      patch.attendanceMarked = true
      attendanceNotifyPayload = {
        previousAttendance: lesson.attendance,
        nextAttendance: patch.attendance,
        topic: lesson.topic,
        canceled: true,
      }
    } else {
      patch.canceled = false
      patch.cancelReason = undefined
      patch.attendanceMarked = false
      const studentIds = await findStudentIdsInGroup(lesson.groupId)
      patch.attendance = buildAttendance(studentIds)
    }
  }

  if (Array.isArray(req.body.attendance)) {
    if (lesson.canceled && req.body.canceled !== false) {
      throw ApiError.badRequest("Restore the lesson before editing attendance")
    }

    const studentIds = await findStudentIdsInGroup(lesson.groupId)

    const allowed = new Set(studentIds)

    const next = []

    for (const row of req.body.attendance) {

      if (!row?.studentId || !allowed.has(row.studentId)) continue

      const status = ["present", "absent", "late", "excused"].includes(row.status)
        ? row.status
        : null

      if (!status) {
        throw ApiError.badRequest("Each student must have an attendance status")
      }

      next.push({

        studentId: row.studentId,

        status,

        notes: row.notes?.trim() || undefined,

      })

    }

    if (next.length !== studentIds.length) {
      throw ApiError.badRequest("Attendance is required for every student in the group")
    }

    patch.attendance = buildAttendance(studentIds, next)
    patch.attendanceMarked = true
    attendanceNotifyPayload = {
      previousAttendance: lesson.attendance,
      nextAttendance: patch.attendance,
      topic: patch.topic ?? lesson.topic,
      canceled: false,
    }

  }



  patch.updatedAt = new Date()



  const updated = await LessonSession.findByIdAndUpdate(

    lesson._id,

    { $set: patch },

    { new: true, runValidators: true },

  )



  await recordAudit({

    req,

    action: "update",

    category: "lessons",

    targetType: "lesson",

    targetId: updated._id,

    targetLabel: formatDateOnly(updated.date),

    details: { groupId: updated.groupId },

  })



  if (attendanceNotifyPayload) {
    await notifyAttendanceChanges({
      group,
      lessonDate: updated.date,
      ...attendanceNotifyPayload,
    }).catch(() => {})
  }



  res.json(serializeLesson(updated))

})



export const deleteLesson = asyncHandler(async (req, res) => {
  const scope = req.query.scope === "weekday-future" ? "weekday-future" : "single"
  const lesson = await assertTenantDoc(LessonSession, req.params.id, req)
  const group = await assertOrgGroup(lesson.groupId, req)

  let deletedCount = 0
  const deletedIds = []

  if (scope === "weekday-future") {
    const weekday = new Date(lesson.date).getUTCDay()
    const fromDate = lesson.date
    const candidates = await LessonSession.find({
      groupId: group._id,
      orgId: group.orgId,
      date: { $gte: fromDate },
    })
    const toDelete = candidates.filter((row) => new Date(row.date).getUTCDay() === weekday)
    deletedIds.push(...toDelete.map((row) => row._id))
    if (deletedIds.length) {
      const result = await LessonSession.deleteMany({ _id: { $in: deletedIds } })
      deletedCount = result.deletedCount ?? deletedIds.length
    }
  } else {
    await LessonSession.findByIdAndDelete(lesson._id)
    deletedIds.push(lesson._id)
    deletedCount = 1
  }

  await recordAudit({
    req,
    action: "delete",
    category: "lessons",
    targetType: "lesson",
    targetId: lesson._id,
    targetLabel: formatDateOnly(lesson.date),
    details: {
      groupId: lesson.groupId,
      scope,
      deletedCount,
      deletedIds,
    },
  })

  res.json({ ok: true, deletedCount })
})


