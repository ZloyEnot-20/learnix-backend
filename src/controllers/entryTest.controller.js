import { EntryTest } from "../models/EntryTest.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {
  recomputeStatus,
  serializeEntryTest,
  serializeEntryTestById,
  serializeEntryTests,
} from "../services/entryTest.service.js"
import { notify } from "../services/notification.service.js"
import { isValidPhone, normalizePhone } from "../utils/phone.js"
import {
  mcLevel,
  readingLevel,
  scoreMc,
  scoreReading,
} from "../content/entry-test.js"
import {
  assertStudentInOrg,
  assertTenantDoc,
  resolveOrgId,
  tenantFilter,
} from "../services/tenantScope.service.js"
import { registerEntryTestCandidate } from "../services/entryTestCandidate.service.js"
import { resourceGroupIds } from "../services/group.service.js"
import { STAFF_PERMISSIONS } from "../constants/staffPermissions.js"
import { recordAudit } from "../services/audit.service.js"

/** Ensure the caller can act on this entry test (owner student or staff). */
function assertAccess(req, doc) {
  if (req.user.type !== "student") return
  if (doc.source === "phone") throw ApiError.forbidden()
  const myStudentId = req.user.id
  if (doc.studentId !== myStudentId) throw ApiError.forbidden()
}

async function findPhoneEntryTest(phone, orgId) {
  const normalized = normalizePhone(phone)
  if (!isValidPhone(normalized)) return null

  const userFilter = { type: "student", phone: normalized }
  if (orgId) userFilter.orgId = orgId
  const user = await User.findOne(userFilter)
  if (!user) return null

  const testFilter = { studentId: user._id, source: "phone" }
  if (orgId) testFilter.orgId = orgId
  return EntryTest.findOne(testFilter).sort({ assignedAt: -1 })
}

async function assertPhoneEntryTest(id, phone) {
  const doc = await EntryTest.findById(id)
  if (!doc || doc.source !== "phone") throw ApiError.notFound("Entry test not found")

  const normalized = normalizePhone(phone)
  const user = await User.findById(doc.studentId).select("phone")
  if (!normalized || !user || user.phone !== normalized) {
    throw ApiError.forbidden("Invalid phone")
  }
  return doc
}

export const listEntryTests = asyncHandler(async (req, res) => {
  const filter = tenantFilter(req)
  const source = req.query.source
  if (source === "phone") {
    filter.source = "phone"
  } else if (source === "student") {
    filter.$or = [{ source: "student" }, { source: { $exists: false } }]
  }
  const groupIds = await resourceGroupIds(req, STAFF_PERMISSIONS.ENTRY_TESTS_VIEW_ALL)
  if (groupIds !== null) {
    const students = await User.find({
      type: "student",
      groupId: { $in: groupIds },
      ...tenantFilter(req),
    })
      .select("_id")
      .lean()
    filter.studentId = { $in: students.map((s) => s._id) }
  }
  const tests = await EntryTest.find(filter).sort({ assignedAt: -1 })
  res.json(await serializeEntryTests(tests))
})

export const getEntryTest = asyncHandler(async (req, res) => {
  const doc = await assertTenantDoc(EntryTest, req.params.id, req)
  assertAccess(req, doc)
  if (req.user.type !== "student") {
    await assertStudentInOrg(doc.studentId, req)
  }
  res.json(await serializeEntryTestById(doc))
})

/** The active entry test for the authenticated student (registered accounts only). */
export const myEntryTest = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const doc = await EntryTest.findOne({ studentId, source: "student" }).sort({ assignedAt: -1 })
  res.json(doc ? await serializeEntryTestById(doc) : null)
})

export const assignEntryTest = asyncHandler(async (req, res) => {
  const student = await assertStudentInOrg(req.body.studentId, req)
  if (!student) throw ApiError.notFound("Student not found")

  const active = await EntryTest.findOne({
    studentId: student._id,
    source: "student",
    status: { $ne: "graded" },
  })
  if (active) throw ApiError.conflict("Student already has an active entry test")

  const doc = await EntryTest.create({
    orgId: student.orgId,
    source: "student",
    studentId: student._id,
    assignedBy: req.user.name,
  })
  await notify(student._id, {
    type: "entry_test",
    title: "Entry / placement test assigned",
    message: "Your tutor assigned a placement test. Open it from your dashboard.",
  }).catch(() => {})
  res.status(201).json(serializeEntryTest(doc, student))
})

/** Staff: create student in ENTRY TEST group + assign phone-based entry test. */
export const registerEntryTestCandidateHandler = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  const teacherId = req.user.type === "teacher" ? req.user.id : null

  const result = await registerEntryTestCandidate({
    orgId,
    assignedBy: req.user.name,
    teacherId,
    name: req.body.name,
    phone: req.body.phone,
    login: req.body.login,
    email: req.body.email,
    notes: req.body.notes,
  })

  await recordAudit({
    req,
    action: "create",
    category: "entry_test",
    targetType: "entry_test",
    targetId: result.entryTest._id,
    targetLabel: result.student.name,
    details: {
      studentId: result.student._id,
      groupId: result.group._id,
      groupName: result.group.name,
      phone: result.student.phone,
    },
  })

  res.status(201).json({
    student: result.student.toStudentJSON(),
    entryTest: serializeEntryTest(result.entryTest, result.student),
    group: { id: result.group._id, name: result.group.name },
    confirmation: result.confirmation,
  })
})

/** Public: look up a phone-based entry test (no auth). */
export const lookupByPhone = asyncHandler(async (req, res) => {
  const orgId = req.body.orgId?.trim() || undefined
  const doc = await findPhoneEntryTest(req.body.phone, orgId)
  if (!doc) throw ApiError.notFound("No entry test found for this phone number")
  res.json(await serializeEntryTestById(doc))
})

export const deleteEntryTest = asyncHandler(async (req, res) => {
  const doc = await assertTenantDoc(EntryTest, req.params.id, req)
  await EntryTest.findByIdAndDelete(doc._id)
  res.json({ ok: true })
})

async function loadOwned(req) {
  const doc = await assertTenantDoc(EntryTest, req.params.id, req)
  assertAccess(req, doc)
  return doc
}

async function saveAndRespond(doc, res) {
  await doc.save()
  res.json(await serializeEntryTestById(doc))
}

export const saveMc = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.mcAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreMc(req.body.answers)
    doc.mcCompleted = true
    doc.mcScore = score
    doc.mcLevel = mcLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const saveReading = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.readingAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreReading(req.body.answers)
    doc.readingCompleted = true
    doc.readingScore = score
    doc.readingLevel = readingLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const saveWritingDraft = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  doc.writingText = req.body.text
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const submitWriting = asyncHandler(async (req, res) => {
  const doc = await loadOwned(req)
  const text = req.body.text
  doc.writingText = text
  doc.writingSubmitted = true
  doc.writingWordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

/** Staff-only: grade the writing + set the overall placement level. */
export const gradeWriting = asyncHandler(async (req, res) => {
  const doc = await EntryTest.findById(req.params.id)
  if (!doc) throw ApiError.notFound("Entry test not found")
  doc.writingLevel = req.body.writingLevel
  doc.overallLevel = req.body.overallLevel
  doc.writingFeedback = req.body.feedback?.trim() || undefined
  doc.status = recomputeStatus(doc)
  await doc.save()
  if (doc.source === "student" && doc.studentId) {
    await notify(doc.studentId, {
      type: "result",
      title: "Your level has been assessed",
      message: `Your tutor set your overall level to ${doc.overallLevel}. View your results.`,
    }).catch(() => {})
  }
  res.json(await serializeEntryTestById(doc))
})

// ─── Public (phone-verified, no login) ─────────────────────────────────────

export const publicSaveMc = asyncHandler(async (req, res) => {
  const doc = await assertPhoneEntryTest(req.params.id, req.body.phone)
  doc.mcAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreMc(req.body.answers)
    doc.mcCompleted = true
    doc.mcScore = score
    doc.mcLevel = mcLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const publicSaveReading = asyncHandler(async (req, res) => {
  const doc = await assertPhoneEntryTest(req.params.id, req.body.phone)
  doc.readingAnswers = req.body.answers
  if (req.body.completed) {
    const score = scoreReading(req.body.answers)
    doc.readingCompleted = true
    doc.readingScore = score
    doc.readingLevel = readingLevel(score)
  }
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const publicSaveWritingDraft = asyncHandler(async (req, res) => {
  const doc = await assertPhoneEntryTest(req.params.id, req.body.phone)
  doc.writingText = req.body.text
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

export const publicSubmitWriting = asyncHandler(async (req, res) => {
  const doc = await assertPhoneEntryTest(req.params.id, req.body.phone)
  const text = req.body.text
  doc.writingText = text
  doc.writingSubmitted = true
  doc.writingWordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  doc.status = recomputeStatus(doc)
  await saveAndRespond(doc, res)
})

