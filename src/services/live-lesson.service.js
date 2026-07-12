import { randomBytes } from "node:crypto"
import { LiveLesson } from "../models/LiveLesson.js"
import { User } from "../models/User.js"
import { ApiError } from "../utils/ApiError.js"
import { findStudentIdsInGroup } from "./group.service.js"
import { flattenUnitExerciseIds, getUnit, loadBook } from "./book.service.js"

const ACTIVE_STATUSES = ["idle", "active", "paused"]
const STUDENT_STATUSES = new Set(["offline", "online", "working", "done"])

function generateJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(6)
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length]
  }
  return code
}

async function uniqueJoinCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateJoinCode()
    const exists = await LiveLesson.exists({ code })
    if (!exists) return code
  }
  throw ApiError.conflict("Could not allocate a unique join code")
}

function findStudentEntry(session, studentId) {
  const sid = String(studentId)
  return (session.students ?? []).find((s) => String(s.studentId) === sid) ?? null
}

export function serialize(session) {
  const json = typeof session.toJSON === "function" ? session.toJSON() : { ...session }
  const students = json.students ?? []
  json.onlineCount = students.filter((s) => s.status === "online" || s.status === "working").length
  json.workingCount = students.filter((s) => s.status === "working").length
  json.doneCount = students.filter((s) => s.status === "done").length
  json.studentCount = students.length
  return json
}

export async function getById(sessionId) {
  const session = await LiveLesson.findById(sessionId)
  if (!session) throw ApiError.notFound("Live lesson not found")
  return session
}

export async function getByCode(code) {
  const normalized = String(code || "")
    .trim()
    .toUpperCase()
  if (!normalized) throw ApiError.badRequest("code is required")
  const session = await LiveLesson.findOne({ code: normalized })
  if (!session) throw ApiError.notFound("Live lesson not found")
  return session
}

export async function getActiveForGroup(groupId) {
  if (!groupId) return null
  return LiveLesson.findOne({
    groupId: String(groupId),
    lessonStatus: { $in: ACTIVE_STATUSES },
  }).sort({ createdAt: -1 })
}

export async function createSession({ orgId, groupId, bookId, teacherId, unitNumber }) {
  if (!orgId) throw ApiError.forbidden("Organization context required")
  if (!groupId) throw ApiError.badRequest("groupId is required")
  if (!bookId) throw ApiError.badRequest("bookId is required")
  if (!teacherId) throw ApiError.badRequest("teacherId is required")

  await loadBook(bookId)

  let currentUnit = null
  let currentExercise = null
  if (unitNumber != null && unitNumber !== "") {
    const { unit, exerciseIds } = await getUnit(bookId, unitNumber)
    currentUnit = Number(unit.unit_number)
    currentExercise = exerciseIds[0] ?? null
  }

  const studentIds = await findStudentIdsInGroup(groupId, orgId)
  const users = studentIds.length
    ? await User.find({ _id: { $in: studentIds } }).select("_id name")
    : []
  const nameById = new Map(users.map((u) => [String(u._id), u.name ?? ""]))

  const students = studentIds.map((id) => ({
    studentId: id,
    name: nameById.get(String(id)) ?? "",
    status: "offline",
    progress: 0,
    score: null,
    startedAt: null,
    completedAt: null,
    lastSeenAt: null,
  }))

  const code = await uniqueJoinCode()

  const session = await LiveLesson.create({
    orgId,
    groupId,
    bookId,
    teacherId,
    code,
    currentUnit,
    currentExercise,
    lessonStatus: "idle",
    openForStudents: false,
    students,
  })

  return session
}

export async function start(sessionId) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }
  session.lessonStatus = "active"
  session.startedAt = session.startedAt ?? new Date()
  session.pausedAt = null
  await session.save()
  return session
}

export async function pause(sessionId) {
  const session = await getById(sessionId)
  if (session.lessonStatus !== "active") {
    throw ApiError.badRequest("Lesson is not active")
  }
  session.lessonStatus = "paused"
  session.pausedAt = new Date()
  await session.save()
  return session
}

export async function resume(sessionId) {
  const session = await getById(sessionId)
  if (session.lessonStatus !== "paused") {
    throw ApiError.badRequest("Lesson is not paused")
  }
  session.lessonStatus = "active"
  session.pausedAt = null
  await session.save()
  return session
}

export async function finish(sessionId) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") return session
  session.lessonStatus = "finished"
  session.finishedAt = new Date()
  session.openForStudents = false
  await session.save()
  return session
}

export async function setCurrentExercise(sessionId, exerciseId, { openForStudents } = {}) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }

  const id = String(exerciseId || "").trim()
  if (!id) throw ApiError.badRequest("exerciseId is required")

  if (session.currentUnit != null) {
    const { exerciseIds } = await getUnit(session.bookId, session.currentUnit)
    if (!exerciseIds.includes(id)) {
      throw ApiError.badRequest(`Exercise ${id} is not in unit ${session.currentUnit}`)
    }
  }

  session.currentExercise = id
  if (typeof openForStudents === "boolean") {
    session.openForStudents = openForStudents
  }
  await session.save()
  return session
}

export async function openForStudents(sessionId, open) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }
  session.openForStudents = Boolean(open)
  await session.save()
  return session
}

export async function studentJoin(sessionIdOrCode, studentId) {
  if (!studentId) throw ApiError.unauthorized()

  let session
  const key = String(sessionIdOrCode || "").trim()
  if (!key) throw ApiError.badRequest("session id or code is required")

  if (key.length === 6 && /^[A-Z0-9]+$/i.test(key)) {
    session = await getByCode(key)
  } else {
    session = await getById(key)
  }

  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is finished")
  }

  const entry = findStudentEntry(session, studentId)
  if (!entry) {
    throw ApiError.forbidden("You are not in this lesson group")
  }

  if (!session.openForStudents && session.lessonStatus === "idle") {
    // Allow join for presence, but teacher controls exercise access via openForStudents
  }

  const now = new Date()
  entry.status = entry.status === "done" ? "done" : "online"
  entry.lastSeenAt = now
  if (!entry.startedAt) entry.startedAt = now
  session.markModified("students")
  await session.save()
  return session
}

export async function studentHeartbeat(sessionId, studentId) {
  const session = await getById(sessionId)
  const entry = findStudentEntry(session, studentId)
  if (!entry) throw ApiError.forbidden("You are not in this lesson group")

  entry.lastSeenAt = new Date()
  if (entry.status === "offline") entry.status = "online"
  session.markModified("students")
  await session.save()
  return session
}

export async function studentProgress(sessionId, studentId, payload = {}) {
  const session = await getById(sessionId)
  const entry = findStudentEntry(session, studentId)
  if (!entry) throw ApiError.forbidden("You are not in this lesson group")

  const now = new Date()
  entry.lastSeenAt = now
  if (!entry.startedAt) entry.startedAt = now

  if (payload.progress != null) {
    const p = Number(payload.progress)
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw ApiError.badRequest("progress must be 0-100")
    }
    entry.progress = p
  }

  if (payload.score !== undefined) {
    entry.score = payload.score == null ? null : Number(payload.score)
  }

  if (payload.status != null) {
    const status = String(payload.status)
    if (!STUDENT_STATUSES.has(status)) {
      throw ApiError.badRequest("Invalid student status")
    }
    entry.status = status
    if (status === "done") entry.completedAt = now
  } else if (entry.status === "offline" || entry.status === "online") {
    entry.status = "working"
  }

  if (payload.answers !== undefined) {
    entry.answers = payload.answers
  }

  session.markModified("students")
  await session.save()
  return session
}

/** Resolve first exercise id for a unit (used by createSession / controllers). */
export async function firstExerciseId(bookId, unitNumber) {
  const { exerciseIds } = await getUnit(bookId, unitNumber)
  return exerciseIds[0] ?? null
}

export { flattenUnitExerciseIds }
