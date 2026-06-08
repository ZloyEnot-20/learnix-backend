import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { StudentClaim, generateClaimCode } from "../models/StudentClaim.js"

/** Add a student to a group (both sides) idempotently. */
export async function addStudentToGroup(groupId, studentId) {
  await Group.updateOne({ _id: groupId }, { $addToSet: { studentIds: studentId } })
  await User.updateOne({ _id: studentId, role: "student" }, { $set: { groupId } })
}

/** Remove a student from a group (both sides). */
export async function removeStudentFromGroup(groupId, studentId) {
  await Group.updateOne({ _id: groupId }, { $pull: { studentIds: studentId } })
  await User.updateOne(
    { _id: studentId, role: "student", groupId },
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
export async function findStudentById(id) {
  return User.findOne({ _id: id, role: "student" })
}

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Create a fresh one-time 6-digit confirmation code for a student. Any previous
 * unused claim for the same student is invalidated so only one code is active.
 * The plaintext password is held until the student redeems the code via the bot.
 */
export async function createStudentClaim(studentId, plainPassword) {
  await StudentClaim.deleteMany({ studentId, usedAt: null })

  const expiresAt = new Date(Date.now() + CLAIM_TTL_MS)
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateClaimCode()
    const active = await StudentClaim.findOne({ code, usedAt: null })
    if (active) continue
    try {
      await StudentClaim.create({ studentId, code, password: plainPassword, expiresAt })
      return { code, expiresAt }
    } catch (err) {
      if (err?.code !== 11000) throw err
    }
  }
  throw new Error("Could not allocate a confirmation code")
}
