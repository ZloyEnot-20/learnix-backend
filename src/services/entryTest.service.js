import { User } from "../models/User.js"



/** Recompute an entry test's status from its section progress. */

export function recomputeStatus(doc) {

  if (doc.writingLevel != null && doc.overallLevel != null) return "graded"

  if (doc.mcCompleted && doc.readingCompleted && doc.writingSubmitted) {

    return "awaiting_review"

  }

  const mcStarted = doc.mcAnswers && doc.mcAnswers.size > 0

  const readingStarted = doc.readingAnswers && doc.readingAnswers.size > 0

  const writingStarted = (doc.writingText ?? "").trim().length > 0

  return mcStarted || readingStarted || writingStarted ? "in_progress" : "assigned"

}



/** API shape: test fields + student profile resolved from User (not stored on EntryTest). */

export function serializeEntryTest(doc, user) {

  const o = doc.toObject({ flattenMaps: true })

  o.id = o._id

  delete o._id

  delete o.__v

  o.studentName = user?.name ?? doc.studentName ?? ""

  o.studentEmail = user?.email ?? doc.studentEmail ?? ""

  o.phone = user?.phone ?? doc.phone ?? undefined

  return o

}



/** Batch-load users for a list of entry tests. */

export async function loadUsersForEntryTests(tests) {

  const studentIds = [...new Set(tests.map((t) => t.studentId).filter(Boolean))]

  if (studentIds.length === 0) return new Map()

  const users = await User.find({ _id: { $in: studentIds } }).select("name email phone")

  return new Map(users.map((u) => [u._id, u]))

}



export async function serializeEntryTests(tests) {

  const userMap = await loadUsersForEntryTests(tests)

  return tests.map((t) => serializeEntryTest(t, userMap.get(t.studentId)))

}



export async function serializeEntryTestById(doc) {

  if (!doc) return null

  const user = doc.studentId

    ? await User.findById(doc.studentId).select("name email phone")

    : null

  return serializeEntryTest(doc, user)

}


