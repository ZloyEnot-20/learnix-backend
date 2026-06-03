import { Group } from "../models/Group.js"
import { Student } from "../models/Student.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { addStudentToGroup, removeStudentFromGroup } from "../services/student.service.js"

export const listGroups = asyncHandler(async (_req, res) => {
  const groups = await Group.find().sort({ createdAt: -1 })
  res.json(groups)
})

export const getGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id)
  if (!group) throw ApiError.notFound("Group not found")
  res.json(group)
})

export const createGroup = asyncHandler(async (req, res) => {
  // Teachers may only create groups they own.
  const teacherId = req.user.role === "teacher" ? req.user.id : req.body.teacherId
  const group = await Group.create({
    ...req.body,
    teacherId,
    studentIds: req.body.studentIds ?? [],
  })
  res.status(201).json(group)
})

export const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!group) throw ApiError.notFound("Group not found")
  res.json(group)
})

export const deleteGroup = asyncHandler(async (req, res) => {
  const group = await Group.findByIdAndDelete(req.params.id)
  if (!group) throw ApiError.notFound("Group not found")
  await Student.updateMany({ groupId: group._id }, { $unset: { groupId: "" } })
  res.json({ ok: true })
})

export const addMember = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id)
  if (!group) throw ApiError.notFound("Group not found")
  await addStudentToGroup(group._id, req.body.studentId)
  res.json(await Group.findById(group._id))
})

export const removeMember = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id)
  if (!group) throw ApiError.notFound("Group not found")
  await removeStudentFromGroup(group._id, req.body.studentId)
  res.json(await Group.findById(group._id))
})
