import { randomBytes } from "node:crypto"
import { LiveLesson } from "../models/LiveLesson.js"
import { User } from "../models/User.js"
import { ApiError } from "../utils/ApiError.js"
import { findStudentIdsInGroup } from "./group.service.js"
import { flattenUnitExerciseIds, getUnit, loadBook } from "./book.service.js"
import {
  getUnitAnswerKey,
  gradeLiveExerciseAnswers,
} from "./book-exercise-grade.service.js"
import { assignUnitVocabHomework } from "./unit-vocab-homework.service.js"

const ACTIVE_STATUSES = ["idle", "active", "paused"]
const STUDENT_STATUSES = new Set(["offline", "online", "working", "done"])

/** Throttle DB flushes for heartbeats (ms). Presence stays fresh in memory via sockets. */
const HEARTBEAT_DB_INTERVAL_MS = 60_000

/** sessionId → Map(studentId → lastDbFlushAt) */
const heartbeatFlushAt = new Map()

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
  const now = Date.now()
  const students = (json.students ?? []).map((s) => {
    const started = s.startedAt ? new Date(s.startedAt).getTime() : null
    const ended = s.completedAt ? new Date(s.completedAt).getTime() : null
    let elapsedSeconds = 0
    if (started) {
      elapsedSeconds = Math.max(0, Math.floor(((ended ?? now) - started) / 1000))
    }
    return {
      ...s,
      elapsedSeconds,
      // Explicitly keep grading payload for teacher UI
      answers: s.answers ?? null,
      scoreDetail: s.scoreDetail ?? null,
      score: s.score ?? null,
    }
  })
  json.students = students
  json.onlineCount = students.filter((s) => s.status === "online" || s.status === "working").length
  json.workingCount = students.filter((s) => s.status === "working").length
  json.doneCount = students.filter((s) => s.status === "done").length
  json.studentCount = students.length
  json.exerciseResults = Array.isArray(json.exerciseResults) ? json.exerciseResults : []
  return json
}

/** Upsert one student's result for the current exercise. */
function upsertExerciseResult(session, entry) {
  if (session.currentUnit == null || !session.currentExercise || !entry) return
  if (!Array.isArray(session.exerciseResults)) session.exerciseResults = []

  const unitNumber = Number(session.currentUnit)
  const exerciseId = String(session.currentExercise)
  const studentId = String(entry.studentId)
  const idx = session.exerciseResults.findIndex(
    (r) =>
      Number(r.unitNumber) === unitNumber &&
      String(r.exerciseId) === exerciseId &&
      String(r.studentId) === studentId,
  )
  const row = {
    unitNumber,
    exerciseId,
    studentId,
    name: entry.name ?? "",
    score: entry.score ?? null,
    scoreDetail: entry.scoreDetail ?? undefined,
    answers: entry.answers ?? undefined,
    completedAt: entry.completedAt ?? new Date(),
  }
  if (idx >= 0) session.exerciseResults[idx] = row
  else session.exerciseResults.push(row)
  session.markModified("exerciseResults")
}

/** Snapshot every student who submitted / completed the open exercise. */
function snapshotOpenExerciseResults(session) {
  if (session.currentUnit == null || !session.currentExercise) return
  for (const entry of session.students ?? []) {
    if (entry.status === "done" || entry.answers != null || entry.scoreDetail != null) {
      upsertExerciseResult(session, entry)
    }
  }
}

/** Build public review payload (answer key) when an exercise is closed. */
async function attachExerciseReview(session) {
  if (session.currentUnit == null || !session.currentExercise) {
    session.lastExerciseReview = undefined
    return
  }
  try {
    const book = await loadBook(session.bookId)
    const answerKey = getUnitAnswerKey(book, session.currentUnit, session.currentExercise)
    // Grade any student who answered but wasn't graded yet
    for (const entry of session.students ?? []) {
      if (entry.answers == null) continue
      if (entry.scoreDetail?.total > 0) continue
      try {
        const graded = gradeLiveExerciseAnswers({
          answerKey,
          studentAnswers: entry.answers,
        })
        if (graded.graded) {
          entry.score = graded.score
          entry.scoreDetail = {
            correct: graded.correct,
            total: graded.total,
            items: graded.items,
          }
        }
      } catch {
        /* ignore per-student grade errors */
      }
    }
    session.markModified("students")
    session.lastExerciseReview = {
      unitNumber: Number(session.currentUnit),
      exerciseId: String(session.currentExercise),
      answerKey: answerKey ?? null,
      closedAt: new Date().toISOString(),
    }
    session.markModified("lastExerciseReview")
  } catch (err) {
    console.error("[live-lesson] review attach error:", err?.message ?? err)
    session.lastExerciseReview = {
      unitNumber: Number(session.currentUnit),
      exerciseId: String(session.currentExercise),
      answerKey: null,
      closedAt: new Date().toISOString(),
    }
  }
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

/**
 * Active live lesson for a student based on User.groupId (no join code).
 */
export async function getActiveForStudent(studentId) {
  if (!studentId) throw ApiError.unauthorized()
  const user = await User.findById(studentId).select("type groupId")
  if (!user || user.type !== "student") {
    throw ApiError.forbidden("Only students can open a live lesson")
  }
  if (!user.groupId) {
    return null
  }
  return getActiveForGroup(user.groupId)
}

/**
 * Org-scoped lesson catalog for teachers: open rooms first, then finished history.
 */
export async function listSessions(orgId, { limit = 40 } = {}) {
  if (!orgId) throw ApiError.forbidden("Organization context required")
  const capped = Math.min(Math.max(Number(limit) || 40, 1), 100)

  const rows = await LiveLesson.find({ orgId: String(orgId) })
    .sort({ updatedAt: -1 })
    .limit(capped)
    .select(
      "code groupId bookId teacherId currentUnit currentExercise lessonStatus openForStudents unitCompleted createdAt updatedAt startedAt finishedAt students",
    )
    .lean()

  const mapped = rows.map((row) => ({
    id: String(row._id),
    code: row.code,
    groupId: row.groupId,
    bookId: row.bookId,
    teacherId: row.teacherId,
    currentUnit: row.currentUnit ?? null,
    currentExercise: row.currentExercise ?? null,
    lessonStatus: row.lessonStatus,
    openForStudents: Boolean(row.openForStudents),
    unitCompleted: Boolean(row.unitCompleted),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    studentCount: Array.isArray(row.students) ? row.students.length : 0,
    onlineCount: Array.isArray(row.students)
      ? row.students.filter((s) => s.status === "online" || s.status === "finished" || s.status === "working" || s.status === "done").length
      : 0,
  }))

  const openRank = (status) => (status === "finished" ? 1 : 0)
  mapped.sort((a, b) => {
    const byStatus = openRank(a.lessonStatus) - openRank(b.lessonStatus)
    if (byStatus !== 0) return byStatus
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return mapped
}

/**
 * Join the active lesson for the student's group (membership via groupId).
 */
export async function studentJoinActive(studentId) {
  const session = await getActiveForStudent(studentId)
  if (!session) {
    throw ApiError.notFound("No live lesson is running for your group")
  }
  return studentJoin(session._id, studentId)
}

/** Close leftover open sessions for the group so only one live room is active. */
async function finishOpenSessionsForGroup(groupId, orgId) {
  await LiveLesson.updateMany(
    {
      groupId: String(groupId),
      orgId: String(orgId),
      lessonStatus: { $in: ACTIVE_STATUSES },
    },
    {
      $set: {
        lessonStatus: "finished",
        openForStudents: false,
        finishedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  )
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

  await finishOpenSessionsForGroup(groupId, orgId)

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
    unitCompleted: false,
    lessonStatus: "idle",
    openForStudents: false,
    students,
  })

  return session
}

function resetStudentProgress(session) {
  for (const s of session.students ?? []) {
    if (s.status === "done" || s.status === "working") {
      s.status = s.status === "offline" ? "offline" : "online"
    }
    s.progress = 0
    s.score = null
    s.scoreDetail = undefined
    s.completedAt = null
    s.answers = undefined
  }
  session.markModified("students")
}

/**
 * Assign a unit to students. Blocked while another unit is active and not completed.
 * Teacher may still preview other units in the admin UI without calling this.
 */
export async function assignUnit(sessionId, unitNumber) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }
  if (session.lessonStatus === "idle") {
    throw ApiError.badRequest("Start the lesson before assigning a unit")
  }

  const nextUnit = Number(unitNumber)
  if (!Number.isFinite(nextUnit) || nextUnit < 1) {
    throw ApiError.badRequest("unitNumber is required")
  }

  const hasActiveUnit =
    session.currentUnit != null && !session.unitCompleted
  if (hasActiveUnit && Number(session.currentUnit) !== nextUnit) {
    if (session.openForStudents) {
      throw ApiError.badRequest("Finish the current exercise before assigning another unit")
    }
    // Exercise closed — allow switching units
  }

  const { unit, exerciseIds } = await getUnit(session.bookId, nextUnit)
  const switching = Number(session.currentUnit) !== Number(unit.unit_number)

  session.currentUnit = Number(unit.unit_number)
  session.currentExercise = exerciseIds[0] ?? null
  session.unitCompleted = false
  session.openForStudents = false

  if (switching) {
    resetStudentProgress(session)
  }

  await session.save()
  return session
}

/** Mark the assigned unit complete so the teacher can assign the next one.
 * Also auto-assigns the matching Cambridge unit vocabulary homework. */
export async function completeUnit(sessionId) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }
  if (session.currentUnit == null) {
    throw ApiError.badRequest("No unit is assigned")
  }
  session.unitCompleted = true
  session.openForStudents = false
  await session.save()

  try {
    await assignUnitVocabHomework(session)
  } catch (err) {
    console.error(
      `[live-lesson] failed to auto-assign vocab homework for unit ${session.currentUnit}:`,
      err?.message || err,
    )
  }

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
  snapshotOpenExerciseResults(session)
  session.lessonStatus = "finished"
  session.finishedAt = new Date()
  session.openForStudents = false
  await session.save()
  heartbeatFlushAt.delete(String(sessionId))
  return session
}

export async function setCurrentExercise(sessionId, exerciseId, { openForStudents } = {}) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }

  const id = String(exerciseId || "").trim()
  if (!id) throw ApiError.badRequest("exerciseId is required")

  if (session.currentUnit == null || session.unitCompleted) {
    throw ApiError.badRequest("Assign an active unit before opening an exercise")
  }

  const { exerciseIds } = await getUnit(session.bookId, session.currentUnit)
  if (!exerciseIds.includes(id)) {
    throw ApiError.badRequest(`Exercise ${id} is not in unit ${session.currentUnit}`)
  }

  // Reset per-student progress only when the exercise pushed to students changes
  const switching = session.currentExercise !== id
  if (switching && session.openForStudents) {
    snapshotOpenExerciseResults(session)
  }
  session.currentExercise = id
  if (typeof openForStudents === "boolean") {
    session.openForStudents = openForStudents
  }
  if (openForStudents === true) {
    session.lastExerciseReview = undefined
  }
  if (switching) {
    resetStudentProgress(session)
  }
  await session.save()
  return session
}

export async function openForStudents(sessionId, open) {
  const session = await getById(sessionId)
  if (session.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is already finished")
  }
  const nextOpen = Boolean(open)
  // Closing an exercise — persist submissions before clearing the live flag
  if (session.openForStudents && !nextOpen) {
    snapshotOpenExerciseResults(session)
    await attachExerciseReview(session)
  }
  if (nextOpen) {
    session.lastExerciseReview = undefined
  }
  session.openForStudents = nextOpen
  await session.save()
  return session
}

export async function studentJoin(sessionIdOrCode, studentId) {
  if (!studentId) throw ApiError.unauthorized()

  const key = String(sessionIdOrCode || "").trim()
  if (!key) throw ApiError.badRequest("session id is required")

  // Legacy: short codes still resolve, but clients should use session id / active join.
  let session
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
    // Allow join if student is currently in this group (roster may be stale)
    const user = await User.findById(studentId).select("type groupId name")
    if (!user || user.type !== "student" || String(user.groupId) !== String(session.groupId)) {
      throw ApiError.forbidden("You are not in this lesson group")
    }
    session.students.push({
      studentId: String(studentId),
      name: user.name ?? "",
      status: "online",
      progress: 0,
      score: null,
      startedAt: new Date(),
      completedAt: null,
      lastSeenAt: new Date(),
    })
  } else {
    const now = new Date()
    entry.status = entry.status === "done" ? "done" : "online"
    entry.lastSeenAt = now
    if (!entry.startedAt) entry.startedAt = now
  }

  session.markModified("students")
  await session.save()
  return session
}

/**
 * Lightweight heartbeat: positional $set only, throttled to ≤1 write / 60s / student.
 * Returns a small presence patch (not full session) so callers avoid broadcasting everything.
 */
export async function studentHeartbeat(sessionId, studentId) {
  const sid = String(sessionId)
  const uid = String(studentId)
  const now = new Date()

  const sessionMeta = await LiveLesson.findById(sid).select("lessonStatus students.studentId students.status")
  if (!sessionMeta) throw ApiError.notFound("Live lesson not found")
  if (sessionMeta.lessonStatus === "finished") {
    throw ApiError.badRequest("Lesson is finished")
  }
  const entry = findStudentEntry(sessionMeta, uid)
  if (!entry) throw ApiError.forbidden("You are not in this lesson group")

  const wasOffline = entry.status === "offline"
  const nextStatus = entry.status === "done" || entry.status === "working" ? entry.status : "online"

  let map = heartbeatFlushAt.get(sid)
  if (!map) {
    map = new Map()
    heartbeatFlushAt.set(sid, map)
  }
  const last = map.get(uid) ?? 0
  const due = wasOffline || Date.now() - last >= HEARTBEAT_DB_INTERVAL_MS

  if (due) {
    await LiveLesson.updateOne(
      { _id: sid, "students.studentId": uid },
      {
        $set: {
          "students.$.lastSeenAt": now,
          ...(wasOffline || entry.status === "offline" ? { "students.$.status": nextStatus } : {}),
          updatedAt: now,
        },
      },
    )
    map.set(uid, Date.now())
  }

  return {
    sessionId: sid,
    studentId: uid,
    status: nextStatus,
    lastSeenAt: now.toISOString(),
    persisted: due,
  }
}

export async function studentProgress(sessionId, studentId, payload = {}) {
  const session = await getById(sessionId)
  const entry = findStudentEntry(session, studentId)
  if (!entry) throw ApiError.forbidden("You are not in this lesson group")

  if (!session.openForStudents) {
    throw ApiError.badRequest("Exercise is not open for students yet")
  }
  if (session.lessonStatus !== "active") {
    throw ApiError.badRequest("Lesson is not active")
  }

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

  // Cap answers payload size to avoid huge documents
  if (payload.answers !== undefined) {
    const raw = JSON.stringify(payload.answers)
    if (raw.length > 20_000) {
      throw ApiError.badRequest("answers payload too large")
    }
    entry.answers = payload.answers
  }

  const markingDone = payload.status === "done"
  // Never trust client score on complete — always grade from answers when possible
  if (!markingDone && payload.score !== undefined && payload.answers === undefined) {
    entry.score = payload.score == null ? null : Number(payload.score)
  }

  let gradedOk = false
  if (entry.answers != null && session.currentUnit != null && session.currentExercise) {
    try {
      const book = await loadBook(session.bookId)
      const answerKey = getUnitAnswerKey(book, session.currentUnit, session.currentExercise)
      const graded = gradeLiveExerciseAnswers({
        answerKey,
        studentAnswers: entry.answers,
      })
      if (graded.graded) {
        entry.score = graded.score
        entry.scoreDetail = {
          correct: graded.correct,
          total: graded.total,
          items: graded.items,
        }
        gradedOk = true
      }
    } catch (err) {
      console.error("[live-lesson] grade error:", err?.message ?? err)
    }
  }

  if (payload.status != null) {
    const status = String(payload.status)
    if (!STUDENT_STATUSES.has(status)) {
      throw ApiError.badRequest("Invalid student status")
    }
    entry.status = status
    if (status === "done") {
      entry.completedAt = now
      entry.progress = 100
      if (!gradedOk) {
        // Do not invent 100 — leave null unless already graded
        if (payload.answers == null && entry.answers == null) {
          entry.score = null
          entry.scoreDetail = undefined
        } else if (!gradedOk) {
          entry.score = entry.scoreDetail ? entry.score : null
          if (!entry.scoreDetail) entry.score = null
        }
      }
      upsertExerciseResult(session, entry)
    } else if (status === "working") {
      entry.completedAt = null
    }
  } else if (entry.status === "offline" || entry.status === "online") {
    entry.status = "working"
  }

  session.markModified("students")
  await session.save()
  return session
}

export async function firstExerciseId(bookId, unitNumber) {
  const { exerciseIds } = await getUnit(bookId, unitNumber)
  return exerciseIds[0] ?? null
}

export { flattenUnitExerciseIds }
