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

async function pickDefaultGroupId() {
  const group = await Group.findOne().sort({ createdAt: 1 })
  if (group) return group._id
  const created = await Group.create({ name: "My Group", description: "Default group" })
  return created._id
}

/**
 * Ensure a Student CRM record exists for an auth account and is in a group, so
 * that group homework reaches them. Idempotent. Returns the student doc.
 */
export async function ensureStudentAccount(account) {
  let student = await Student.findById(account.id)
  if (!student) {
    const groupId = await pickDefaultGroupId()
    student = await Student.create({
      _id: account.id,
      name: account.name,
      email: account.email,
      groupId,
    })
    await addStudentToGroup(groupId, student._id)
    return student
  }
  if (!student.groupId) {
    const groupId = await pickDefaultGroupId()
    await addStudentToGroup(groupId, student._id)
    student = await Student.findById(account.id)
  }
  return student
}
