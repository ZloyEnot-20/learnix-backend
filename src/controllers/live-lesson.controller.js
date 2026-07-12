import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { assertOrgGroup, assertTenantDoc, withOrgId } from "../services/tenantScope.service.js"
import { assertSelectableGroup } from "../services/group.service.js"
import { isStaffType } from "../constants/userTypes.js"
import * as bookService from "../services/book.service.js"
import * as liveLessonService from "../services/live-lesson.service.js"
import { emitLessonPresence, emitLessonState } from "../realtime/live-lesson.io.js"
import { LiveLesson } from "../models/LiveLesson.js"

function pushState(session) {
  const state = liveLessonService.serialize(session)
  emitLessonState(session._id, state)
  return state
}

async function loadTeacherSession(req) {
  const session = await assertTenantDoc(LiveLesson, req.params.id, req)
  await assertOrgGroup(session.groupId, req)
  return session
}

/** Platform books — available to every authenticated tenant user. */
export const listBooks = asyncHandler(async (_req, res) => {
  const books = await bookService.listBooks()
  res.json(books)
})

export const getBook = asyncHandler(async (req, res) => {
  const book = await bookService.loadBook(req.params.bookId)
  const staff = isStaffType(req.user.type)
  res.json({
    bookId: book.bookId,
    book: book.book ?? null,
    units: (book.units ?? []).map((u) => ({
      unit_number: u.unit_number,
      title: u.title,
      subtitle: u.subtitle ?? null,
      ready: Array.isArray(u.sections) && u.sections.length > 0,
      exerciseIds: bookService.flattenUnitExerciseIds(u),
    })),
    // Full unit payloads are fetched per-unit; answer_key only for staff
    ...(staff ? { answer_key: book.answer_key ?? {} } : {}),
  })
})

export const getBookUnit = asyncHandler(async (req, res) => {
  const staff = isStaffType(req.user.type)
  const result = await bookService.getUnit(req.params.bookId, req.params.unitNumber, {
    includeAnswers: staff,
  })
  res.json(result)
})

export const createLiveLesson = asyncHandler(async (req, res) => {
  const { groupId, bookId, unitNumber } = req.body
  const group = assertSelectableGroup(await assertOrgGroup(groupId, req))
  const { orgId } = withOrgId(req)

  const session = await liveLessonService.createSession({
    orgId,
    groupId: group._id,
    bookId: bookId || bookService.BOOK_ID,
    teacherId: req.user.id,
    unitNumber,
  })

  res.status(201).json(pushState(session))
})

export const getLiveLesson = asyncHandler(async (req, res) => {
  const session = await loadTeacherSession(req)
  res.json(liveLessonService.serialize(session))
})

export const startLiveLesson = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const session = await liveLessonService.start(req.params.id)
  res.json(pushState(session))
})

export const pauseLiveLesson = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const session = await liveLessonService.pause(req.params.id)
  res.json(pushState(session))
})

export const resumeLiveLesson = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const session = await liveLessonService.resume(req.params.id)
  res.json(pushState(session))
})

export const finishLiveLesson = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const session = await liveLessonService.finish(req.params.id)
  res.json(pushState(session))
})

export const selectExercise = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const { exerciseId, openForStudents } = req.body
  const session = await liveLessonService.setCurrentExercise(req.params.id, exerciseId, {
    openForStudents,
  })
  res.json(pushState(session))
})

export const setOpenForStudents = asyncHandler(async (req, res) => {
  await loadTeacherSession(req)
  const session = await liveLessonService.openForStudents(req.params.id, req.body.openForStudents)
  res.json(pushState(session))
})

export const joinByCode = asyncHandler(async (req, res) => {
  if (req.user.type !== "student") {
    throw ApiError.forbidden("Only students can join by code")
  }
  const session = await liveLessonService.getByCode(req.params.code)
  const entry = (session.students ?? []).find((s) => String(s.studentId) === String(req.user.id))
  if (!entry) throw ApiError.forbidden("You are not in this lesson group")
  res.json(liveLessonService.serialize(session))
})

export const joinLiveLesson = asyncHandler(async (req, res) => {
  if (req.user.type !== "student") {
    throw ApiError.forbidden("Only students can join a live lesson")
  }
  const session = await liveLessonService.studentJoin(req.params.id, req.user.id)
  res.json(pushState(session))
})

export const studentProgress = asyncHandler(async (req, res) => {
  if (req.user.type !== "student") {
    throw ApiError.forbidden("Only students can update progress")
  }
  const session = await liveLessonService.studentProgress(req.params.id, req.user.id, req.body)
  res.json(pushState(session))
})

/** Heartbeat returns a small presence patch — does not fan-out full lesson state via REST. */
export const studentHeartbeat = asyncHandler(async (req, res) => {
  if (req.user.type !== "student") {
    throw ApiError.forbidden("Only students can send heartbeats")
  }
  const patch = await liveLessonService.studentHeartbeat(req.params.id, req.user.id)
  emitLessonPresence(patch.sessionId, patch)
  res.json(patch)
})
