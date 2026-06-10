import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { EntryTest } from "../models/EntryTest.js"
import { hashPassword } from "../utils/password.js"
import { ApiError } from "../utils/ApiError.js"
import { isValidPhone, normalizePhone } from "../utils/phone.js"
import { generatePassword, normalizeLogin, suggestLogins } from "../utils/login.js"
import {
  addStudentToGroup,
  createStudentClaim,
} from "./student.service.js"
import { assertCanAddStudent } from "./orgLimits.service.js"

export const ENTRY_TEST_GROUP_NAME = "ENTRY TEST"

/** Find or create the org-wide entry-test candidate group. */
export async function ensureEntryTestGroup(orgId, teacherId = null) {
  let group = await Group.findOne({ orgId, name: ENTRY_TEST_GROUP_NAME })
  if (!group) {
    group = await Group.create({
      orgId,
      name: ENTRY_TEST_GROUP_NAME,
      description: "Candidates assigned the entry / placement test",
      teacherId: teacherId ?? undefined,
    })
  }
  return group
}

async function resolveLogin(name, orgId, preferredLogin) {
  const explicit = normalizeLogin(preferredLogin)
  if (explicit) {
    const taken = await User.findOne({
      orgId,
      $or: [{ login: explicit }, { email: explicit }],
    })
    if (taken) throw ApiError.conflict(`Login "${explicit}" is already taken`)
    return explicit
  }

  const suggestions = await suggestLogins(name, orgId)
  if (suggestions.length > 0) return suggestions[0]

  const fallback = `entry${Date.now().toString(36).slice(-6)}`
  if (await User.findOne({ orgId, login: fallback })) {
    throw ApiError.conflict("Could not generate a unique login")
  }
  return fallback
}

/**
 * Create a student in the ENTRY TEST group and assign a phone-based entry test.
 * Returns the student, entry test, Telegram claim code, and group.
 */
export async function registerEntryTestCandidate({
  orgId,
  assignedBy,
  teacherId = null,
  name,
  phone,
  login,
  email,
  notes,
}) {
  const normalizedPhone = normalizePhone(phone)
  if (!isValidPhone(normalizedPhone)) {
    throw ApiError.badRequest("Enter a valid Uzbekistan phone number (+998 XX XXX XX XX)")
  }

  const trimmedName = name?.trim()
  if (!trimmedName) throw ApiError.badRequest("Student name is required")

  const phoneTaken = await User.findOne({
    orgId,
    type: "student",
    phone: normalizedPhone,
  })
  if (phoneTaken) {
    const existingEntryTest = await EntryTest.findOne({
      orgId,
      studentId: phoneTaken._id,
      source: "phone",
    })
    if (existingEntryTest) {
      throw ApiError.conflict("This phone number is already registered for an entry test")
    }
    throw ApiError.conflict("A student with this phone number already exists")
  }

  await assertCanAddStudent(orgId)

  const group = await ensureEntryTestGroup(orgId, teacherId)
  const resolvedLogin = await resolveLogin(trimmedName, orgId, login)

  const normalizedEmail = email?.trim()?.toLowerCase()
  if (normalizedEmail) {
    const emailTaken = await User.findOne({ orgId, email: normalizedEmail })
    if (emailTaken) throw ApiError.conflict("Email is already registered")
  }

  const plainPassword = generatePassword()
  const passwordHash = await hashPassword(plainPassword)

  const userPayload = {
    orgId,
    login: resolvedLogin,
    name: trimmedName,
    phone: normalizedPhone,
    type: "student",
    passwordHash,
    groupId: group._id,
    notes: notes?.trim() || undefined,
  }
  if (normalizedEmail) userPayload.email = normalizedEmail

  const student = await User.create(userPayload)
  await addStudentToGroup(group._id, student._id)

  const entryTest = await EntryTest.create({
    orgId,
    source: "phone",
    studentId: student._id,
    assignedBy,
  })

  const { code, expiresAt } = await createStudentClaim(student._id, plainPassword)

  return {
    student,
    entryTest,
    group,
    confirmation: { login: student.login, code, expiresAt },
  }
}
