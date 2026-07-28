import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { Submission } from "../models/Submission.js"
import { Homework } from "../models/Homework.js"
import { IssueReport } from "../models/IssueReport.js"
import { Payment } from "../models/Payment.js"
import { StudentActivity } from "../models/StudentActivity.js"
import { AdminBroadcast } from "../models/AdminBroadcast.js"
import { AdminAlertRead } from "../models/AdminAlertRead.js"
import { ACTIVE_STUDENT_FILTER } from "./student.service.js"
import { notifyMany } from "./notification.service.js"
import { USER_TYPES } from "../constants/userTypes.js"

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000
const REVIEW_DELAY_MS = 48 * 60 * 60 * 1000
const MANUAL_REVIEW_SUBJECTS = new Set(["speaking", "writing", "grammar"])

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function submissionNeedsManualReview(sub, homeworkById) {
  if (sub.status !== "submitted") return false
  const hw = homeworkById.get(sub.homeworkId)
  if (!hw) return false
  return MANUAL_REVIEW_SUBJECTS.has(hw.subject)
}

async function loadHomeworkMap(orgFilter) {
  const rows = await Homework.find(orgFilter).select("_id subject title groupId").lean()
  return new Map(rows.map((h) => [h._id, h]))
}

async function pendingReviewSubmissionIds(orgFilter, homeworkById) {
  const subs = await Submission.find({ ...orgFilter, status: "submitted" })
    .select("homeworkId")
    .lean()
  return subs.filter((s) => submissionNeedsManualReview(s, homeworkById)).length
}

export async function getDashboardStats(orgFilter) {
  const today = startOfToday()
  const onlineSince = new Date(Date.now() - ONLINE_THRESHOLD_MS)
  const homeworkById = await loadHomeworkMap(orgFilter)

  const [
    totalStudents,
    totalTeachers,
    activeToday,
    onlineByLogin,
    activeStudentIds,
    pendingHomeworkReview,
    newRegistrationsToday,
  ] = await Promise.all([
    User.countDocuments({ ...orgFilter, type: USER_TYPES.STUDENT, ...ACTIVE_STUDENT_FILTER }),
    User.countDocuments({ ...orgFilter, type: USER_TYPES.TEACHER }),
    User.countDocuments({
      ...orgFilter,
      deletedAt: null,
      lastLoginAt: { $gte: today },
    }),
    User.countDocuments({
      ...orgFilter,
      deletedAt: null,
      lastLoginAt: { $gte: onlineSince },
    }),
    StudentActivity.distinct("studentId", {
      ...orgFilter,
      at: { $gte: onlineSince },
    }),
    pendingReviewSubmissionIds(orgFilter, homeworkById),
    User.countDocuments({
      ...orgFilter,
      type: USER_TYPES.STUDENT,
      joinedAt: { $gte: today },
    }),
  ])

  const onlineStudentIds = new Set(activeStudentIds)
  const onlineStaff = await User.countDocuments({
    ...orgFilter,
    type: { $in: [USER_TYPES.TEACHER, USER_TYPES.ADMIN, USER_TYPES.SUPER_ADMIN] },
    lastLoginAt: { $gte: onlineSince },
  })
  const onlineFromActivity = await User.countDocuments({
    ...orgFilter,
    _id: { $in: [...onlineStudentIds] },
    deletedAt: null,
  })
  const usersOnlineNow = Math.max(onlineByLogin, onlineFromActivity + onlineStaff)

  return {
    totalStudents,
    totalTeachers,
    activeUsersToday: activeToday,
    usersOnlineNow,
    pendingHomeworkReview,
    newRegistrationsToday,
  }
}

export async function listTeachersOverview(orgFilter) {
  const teachers = await User.find({ ...orgFilter, type: USER_TYPES.TEACHER })
    .select("name avatarUrl lastLoginAt")
    .sort({ name: 1 })
    .lean()

  if (teachers.length === 0) return []

  const teacherIds = teachers.map((t) => t._id)
  const groups = await Group.find({ ...orgFilter, teacherId: { $in: teacherIds } })
    .select("_id teacherId name")
    .lean()
  const groupIds = groups.map((g) => g._id)
  const groupsByTeacher = new Map()
  for (const g of groups) {
    const list = groupsByTeacher.get(g.teacherId) ?? []
    list.push(g)
    groupsByTeacher.set(g.teacherId, list)
  }

  const students = groupIds.length
    ? await User.find({
        ...orgFilter,
        type: USER_TYPES.STUDENT,
        groupId: { $in: groupIds },
        ...ACTIVE_STUDENT_FILTER,
      })
        .select("_id groupId")
        .lean()
    : []

  const studentsByGroup = new Map()
  for (const s of students) {
    const list = studentsByGroup.get(s.groupId) ?? []
    list.push(s._id)
    studentsByGroup.set(s.groupId, list)
  }

  const homeworkById = await loadHomeworkMap(orgFilter)
  const studentIds = students.map((s) => s._id)
  const pendingSubs =
    studentIds.length > 0
      ? await Submission.find({
          ...orgFilter,
          studentId: { $in: studentIds },
          status: "submitted",
        })
          .select("studentId homeworkId")
          .lean()
      : []

  const pendingByStudent = new Map()
  for (const sub of pendingSubs) {
    if (!submissionNeedsManualReview(sub, homeworkById)) continue
    pendingByStudent.set(sub.studentId, (pendingByStudent.get(sub.studentId) ?? 0) + 1)
  }

  const onlineSince = new Date(Date.now() - ONLINE_THRESHOLD_MS)

  return teachers.map((t) => {
    const teacherGroups = groupsByTeacher.get(t._id) ?? []
    const attachedStudentIds = new Set()
    for (const g of teacherGroups) {
      for (const sid of studentsByGroup.get(g._id) ?? []) {
        attachedStudentIds.add(sid)
      }
    }
    let pendingReview = 0
    for (const sid of attachedStudentIds) {
      pendingReview += pendingByStudent.get(sid) ?? 0
    }
    const lastLoginAt = t.lastLoginAt ?? null
    const isOnline = lastLoginAt ? lastLoginAt >= onlineSince : false

    return {
      id: t._id,
      name: t.name,
      avatarUrl: t.avatarUrl ?? null,
      studentCount: attachedStudentIds.size,
      pendingReview,
      lastActivityAt: lastLoginAt,
      isOnline,
      groupIds: teacherGroups.map((g) => g._id),
      groupNames: teacherGroups.map((g) => g.name),
    }
  })
}

export async function listHomeworkReviewQueue(orgFilter) {
  const homeworkById = await loadHomeworkMap(orgFilter)
  const manualHomeworkIds = [...homeworkById.entries()]
    .filter(([, hw]) => MANUAL_REVIEW_SUBJECTS.has(hw.subject))
    .map(([id]) => id)

  if (manualHomeworkIds.length === 0) return []

  const subs = await Submission.find({
    ...orgFilter,
    homeworkId: { $in: manualHomeworkIds },
    status: { $in: ["submitted", "graded"] },
  })
    .sort({ submittedAt: -1, updatedAt: -1 })
    .lean()

  const studentIds = [...new Set(subs.map((s) => s.studentId))]
  const students = studentIds.length
    ? await User.find({ _id: { $in: studentIds } })
        .select("name groupId")
        .lean()
    : []
  const studentById = new Map(students.map((s) => [s._id, s]))

  return subs
    .filter((s) => s.status === "submitted")
    .map((s) => {
      const hw = homeworkById.get(s.homeworkId)
      const student = studentById.get(s.studentId)
      return {
        id: s._id,
        studentId: s.studentId,
        studentName: student?.name ?? "Unknown",
        groupId: student?.groupId ?? null,
        homeworkId: s.homeworkId,
        homeworkTitle: hw?.title ?? "Homework",
        subject: hw?.subject ?? "grammar",
        submittedAt: s.submittedAt ?? s.updatedAt,
        status: s.status,
      }
    })
}

export async function sendBroadcast({
  orgId,
  sentBy,
  audience,
  audienceId,
  title,
  message,
}) {
  let studentIds = []
  let audienceLabel = "All students"

  if (audience === "all") {
    const rows = await User.find({
      orgId,
      type: USER_TYPES.STUDENT,
      ...ACTIVE_STUDENT_FILTER,
    })
      .select("_id")
      .lean()
    studentIds = rows.map((r) => r._id)
  } else if (audience === "group") {
    const group = await Group.findOne({ _id: audienceId, orgId }).select("name").lean()
    if (!group) throw new Error("Group not found")
    audienceLabel = group.name
    const rows = await User.find({
      orgId,
      type: USER_TYPES.STUDENT,
      groupId: audienceId,
      ...ACTIVE_STUDENT_FILTER,
    })
      .select("_id")
      .lean()
    studentIds = rows.map((r) => r._id)
  } else if (audience === "student") {
    const student = await User.findOne({
      _id: audienceId,
      orgId,
      type: USER_TYPES.STUDENT,
      ...ACTIVE_STUDENT_FILTER,
    })
      .select("name")
      .lean()
    if (!student) throw new Error("Student not found")
    audienceLabel = student.name
    studentIds = [audienceId]
  }

  if (studentIds.length === 0) {
    throw new Error("No recipients found for this audience")
  }

  await notifyMany(studentIds, {
    type: "system",
    title,
    message,
    data: { broadcast: true, audience },
  })

  const record = await AdminBroadcast.create({
    orgId,
    sentById: sentBy.id,
    sentByName: sentBy.name,
    audience,
    audienceId: audienceId ?? null,
    audienceLabel,
    title,
    message,
    recipientCount: studentIds.length,
  })

  return record.toJSON()
}

export async function listBroadcastHistory(orgFilter, limit = 50) {
  const rows = await AdminBroadcast.find(orgFilter).sort({ createdAt: -1 }).limit(limit).lean()
  return rows.map((r) => ({
    id: r._id,
    sentById: r.sentById,
    sentByName: r.sentByName,
    audience: r.audience,
    audienceId: r.audienceId ?? null,
    audienceLabel: r.audienceLabel ?? null,
    title: r.title,
    message: r.message,
    recipientCount: r.recipientCount,
    createdAt: r.createdAt,
  }))
}

function buildAlertKey(type, refId) {
  return `${type}:${refId}`
}

export async function listAdminAlerts(orgFilter, userId) {
  const now = Date.now()
  const today = startOfToday()
  const reviewCutoff = new Date(now - REVIEW_DELAY_MS)

  const [registrations, recentHomework, complaints, overduePayments, delayedReviews, readRows] =
    await Promise.all([
      User.find({
        ...orgFilter,
        type: USER_TYPES.STUDENT,
        joinedAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      })
        .select("name joinedAt")
        .sort({ joinedAt: -1 })
        .limit(20)
        .lean(),
      Submission.find({
        ...orgFilter,
        status: "submitted",
        submittedAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      })
        .select("studentId homeworkId submittedAt")
        .sort({ submittedAt: -1 })
        .limit(20)
        .lean(),
      IssueReport.find({ ...orgFilter, status: "open" })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Payment.find({
        ...orgFilter,
        status: "overdue",
        dueDate: { $lt: new Date() },
      })
        .sort({ dueDate: -1 })
        .limit(20)
        .lean(),
      Submission.find({
        ...orgFilter,
        status: "submitted",
        submittedAt: { $lte: reviewCutoff },
      })
        .select("studentId homeworkId submittedAt")
        .sort({ submittedAt: 1 })
        .limit(20)
        .lean(),
      AdminAlertRead.find({ ...orgFilter, userId }).select("alertKey readAt").lean(),
    ])

  const readKeys = new Set(readRows.map((r) => r.alertKey))
  const homeworkById = await loadHomeworkMap(orgFilter)
  const studentIds = [
    ...new Set([
      ...recentHomework.map((s) => s.studentId),
      ...delayedReviews.map((s) => s.studentId),
      ...overduePayments.map((p) => p.studentId),
    ]),
  ]
  const students = studentIds.length
    ? await User.find({ _id: { $in: studentIds } })
        .select("name")
        .lean()
    : []
  const studentNameById = new Map(students.map((s) => [s._id, s.name]))

  const alerts = []

  for (const s of registrations) {
    const key = buildAlertKey("registration", s._id)
    alerts.push({
      id: key,
      type: "registration",
      title: "New registration",
      message: `${s.name} joined the platform`,
      createdAt: s.joinedAt,
      read: readKeys.has(key),
      data: { studentId: s._id, studentName: s.name },
    })
  }

  for (const sub of recentHomework) {
    const hw = homeworkById.get(sub.homeworkId)
    if (!hw || !MANUAL_REVIEW_SUBJECTS.has(hw.subject)) continue
    const key = buildAlertKey("homework", sub._id)
    const studentName = studentNameById.get(sub.studentId) ?? "Student"
    alerts.push({
      id: key,
      type: "homework",
      title: "Homework submitted",
      message: `${studentName} submitted ${hw.title}`,
      createdAt: sub.submittedAt,
      read: readKeys.has(key),
      data: {
        submissionId: sub._id,
        homeworkId: sub.homeworkId,
        studentId: sub.studentId,
        subject: hw.subject,
      },
    })
  }

  for (const report of complaints) {
    const key = buildAlertKey("complaint", report._id)
    alerts.push({
      id: key,
      type: "complaint",
      title: "User report",
      message: `${report.studentName}: ${report.exerciseTitle}`,
      createdAt: report.createdAt,
      read: readKeys.has(key),
      data: { reportId: report._id, studentId: report.studentId },
    })
  }

  for (const pay of overduePayments) {
    const key = buildAlertKey("payment", pay._id)
    const studentName = studentNameById.get(pay.studentId) ?? "Student"
    alerts.push({
      id: key,
      type: "payment",
      title: "Payment overdue",
      message: `${studentName} — ${pay.periodLabel}`,
      createdAt: pay.dueDate,
      read: readKeys.has(key),
      data: { paymentId: pay._id, studentId: pay.studentId },
    })
  }

  for (const sub of delayedReviews) {
    const hw = homeworkById.get(sub.homeworkId)
    if (!hw || !MANUAL_REVIEW_SUBJECTS.has(hw.subject)) continue
    const key = buildAlertKey("review_delay", sub._id)
    const studentName = studentNameById.get(sub.studentId) ?? "Student"
    alerts.push({
      id: key,
      type: "review_delay",
      title: "Review delayed",
      message: `${hw.title} from ${studentName} awaits grading`,
      createdAt: sub.submittedAt,
      read: readKeys.has(key),
      data: {
        submissionId: sub._id,
        homeworkId: sub.homeworkId,
        studentId: sub.studentId,
      },
    })
  }

  if (registrations.some((s) => s.joinedAt >= today)) {
    const count = registrations.filter((s) => s.joinedAt >= today).length
    const key = buildAlertKey("system", `registrations-${today.toISOString().slice(0, 10)}`)
    if (!alerts.some((a) => a.id === key)) {
      alerts.push({
        id: key,
        type: "system",
        title: "Daily summary",
        message: `${count} new student${count === 1 ? "" : "s"} registered today`,
        createdAt: new Date(),
        read: readKeys.has(key),
        data: { count },
      })
    }
  }

  alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return alerts
}

export async function markAlertRead(orgFilter, userId, alertKey) {
  await AdminAlertRead.findOneAndUpdate(
    { ...orgFilter, userId, alertKey },
    { $set: { readAt: new Date() } },
    { upsert: true, new: true },
  )
  return { ok: true }
}

export async function markAllAlertsRead(orgFilter, userId, alertKeys) {
  if (!alertKeys.length) return { ok: true }
  const ops = alertKeys.map((alertKey) => ({
    updateOne: {
      filter: { ...orgFilter, userId, alertKey },
      update: { $set: { readAt: new Date() } },
      upsert: true,
    },
  }))
  await AdminAlertRead.bulkWrite(ops)
  return { ok: true }
}
