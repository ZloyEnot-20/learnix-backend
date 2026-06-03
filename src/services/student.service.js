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
