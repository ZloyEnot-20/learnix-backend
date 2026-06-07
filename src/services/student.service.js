import { User } from "../models/User.js"
import { Group } from "../models/Group.js"

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
