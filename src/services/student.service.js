import { Student } from "../models/Student.js"
import { Group } from "../models/Group.js"

/** Add a student to a group (both sides) idempotently. */
export async function addStudentToGroup(groupId, studentId) {
  await Group.updateOne({ _id: groupId }, { $addToSet: { studentIds: studentId } })
  await Student.updateOne({ _id: studentId }, { $set: { groupId } })
}

/** Remove a student from a group (both sides). */
export async function removeStudentFromGroup(groupId, studentId) {
  await Group.updateOne({ _id: groupId }, { $pull: { studentIds: studentId } })
  await Student.updateOne(
    { _id: studentId, groupId },
    { $unset: { groupId: "" } },
  )
}

/**
 * Ensure a Student CRM record exists for an auth account. New students are NOT
 * placed into any group automatically — an admin assigns the group later.
 * Idempotent. Returns the student doc.
 */
export async function ensureStudentAccount(account) {
  let student = await Student.findById(account.id)
  if (!student) {
    student = await Student.create({
      _id: account.id,
      name: account.name,
      email: account.email,
    })
  }
  return student
}

/**
 * Ensure the linked Student CRM record exists and mirrors the auth account's
 * name/email. The auth account is the source of truth for a student's own
 * name/email, so editing the user propagates to the admin list and the parent
 * Telegram notifications (which read from the Student record). Idempotent.
 */
export async function syncStudentProfile(user) {
  let student = user.studentId ? await Student.findById(user.studentId) : null
  if (!student) student = await Student.findById(user._id)
  if (!student) {
    return Student.create({ _id: user._id, name: user.name, email: user.email })
  }
  // The Student schema trims/lowercases, so compare against normalised values
  // to avoid redundant writes on every read.
  const name = (user.name ?? "").trim()
  const email = (user.email ?? "").trim().toLowerCase()
  if (student.name !== name || student.email !== email) {
    student.name = name
    student.email = email
    await student.save()
  }
  return student
}
