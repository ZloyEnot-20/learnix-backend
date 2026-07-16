import { IssueReport } from "../models/IssueReport.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { escapeRegex } from "../utils/regex.js"
import { tenantFilter, withOrgId } from "../services/tenantScope.service.js"

export const createIssueReport = asyncHandler(async (req, res) => {
  const {
    homeworkId,
    controlWorkId,
    liveLessonId,
    bookId,
    unitNumber,
    exerciseId,
    stepIndex,
    exerciseSlug,
    exerciseTitle,
    exerciseKind,
    questionIndex,
    questionId,
    questionPrompt,
    message,
  } = req.body

  if (!homeworkId && !controlWorkId && !liveLessonId && !bookId && !exerciseSlug) {
    throw ApiError.badRequest(
      "homeworkId, controlWorkId, liveLessonId, bookId, or exerciseSlug is required",
    )
  }

  if (!exerciseSlug || !exerciseTitle || !exerciseKind) {
    throw ApiError.badRequest("exerciseSlug, exerciseTitle, and exerciseKind are required")
  }

  const doc = await IssueReport.create(
    withOrgId(req, {
      studentId: req.user.id,
      studentName: req.user.name ?? "Student",
      homeworkId: homeworkId ?? null,
      controlWorkId: controlWorkId ?? null,
      liveLessonId: liveLessonId ?? null,
      bookId: bookId ?? null,
      unitNumber: unitNumber ?? null,
      exerciseId: exerciseId != null ? String(exerciseId) : null,
      stepIndex: stepIndex ?? null,
      exerciseSlug,
      exerciseTitle,
      exerciseKind,
      questionIndex: questionIndex ?? null,
      questionId: questionId ?? null,
      questionPrompt: questionPrompt ?? null,
      message: message?.trim() || null,
      status: "open",
    }),
  )

  res.status(201).json(doc.toJSON())
})

export const listIssueReports = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const skip = (page - 1) * limit

  const filter = { ...tenantFilter(req) }

  if (req.query.status && req.query.status !== "all") {
    filter.status = req.query.status
  }
  if (req.query.exerciseKind && req.query.exerciseKind !== "all") {
    filter.exerciseKind = req.query.exerciseKind
  }

  const search = String(req.query.search ?? "").trim()
  if (search) {
    const safe = escapeRegex(search)
    filter.$or = [
      { studentName: { $regex: safe, $options: "i" } },
      { exerciseTitle: { $regex: safe, $options: "i" } },
      { exerciseSlug: { $regex: safe, $options: "i" } },
      { questionPrompt: { $regex: safe, $options: "i" } },
      { message: { $regex: safe, $options: "i" } },
    ]
  }

  const [items, total, openCount] = await Promise.all([
    IssueReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    IssueReport.countDocuments(filter),
    IssueReport.countDocuments({ ...tenantFilter(req), status: "open" }),
  ])

  res.json({
    items: items.map((doc) => doc.toJSON()),
    total,
    openCount,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  })
})

export const updateIssueReport = asyncHandler(async (req, res) => {
  const { status } = req.body
  const filter = { _id: req.params.id, ...tenantFilter(req) }

  const doc = await IssueReport.findOne(filter)
  if (!doc) throw ApiError.notFound("Issue report not found")

  doc.status = status
  if (status === "resolved" || status === "dismissed") {
    doc.resolvedAt = new Date()
    doc.resolvedById = req.user.id
    doc.resolvedByName = req.user.name ?? "Staff"
  } else {
    doc.resolvedAt = null
    doc.resolvedById = null
    doc.resolvedByName = null
  }

  await doc.save()
  res.json(doc.toJSON())
})
