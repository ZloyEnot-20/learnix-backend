import { User } from "../models/User.js"
import { StudentClaim, generateClaimCode } from "../models/StudentClaim.js"

/** Assign a student to a group (membership lives on User.groupId only). */
export async function addStudentToGroup(groupId, studentId) {
  await User.updateOne({ _id: studentId, type: "student" }, { $set: { groupId } })
}

/** Remove a student from a group. */
export async function removeStudentFromGroup(groupId, studentId) {
  await User.updateOne(
    { _id: studentId, type: "student", groupId },
    { $unset: { groupId: "" } },
  )
}

/** Ensure legacy accounts have a login field (email doubles as login). */
export async function ensureLoginField(user) {
  if (user.login || !user.email) return user
  user.login = user.email
  await user.save()
  return user
}

/** Load a student user or throw null. */
export async function findStudentById(id, orgId = null) {
  const filter = { _id: id, type: "student" }
  if (orgId) filter.orgId = orgId
  return User.findOne(filter)
}

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Create a fresh one-time 6-digit confirmation code for a student. Any previous
 * unused claim for the same student is invalidated so only one code is active.
 * The plaintext password is held until the student redeems the code via the bot.
 */
export async function createStudentClaim(studentId, plainPassword) {
  const student = await User.findById(studentId).select("orgId")
  if (!student?.orgId) throw new Error("Student organization is missing")

  await StudentClaim.deleteMany({ studentId, usedAt: null })

  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS)
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateClaimCode()
    const active = await StudentClaim.findOne({ code, usedAt: null })
    if (active) continue
    try {
      await StudentClaim.create({
        studentId,
        orgId: student.orgId,
        code,
        password: plainPassword,
        expiresAt,
      })
      return { code, expiresAt }
    } catch (err) {
      if (err?.code !== 11000) throw err
    }
  }
  throw new Error("Could not allocate a confirmation code")
}
