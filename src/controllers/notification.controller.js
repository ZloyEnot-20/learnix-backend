import { Notification } from "../models/Notification.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

function studentIdOf(req) {
  return req.user.id
}

const MOBILE_EXCLUDED_TYPES = ["attendance"]

function isMobileClient(req) {
  return req.get("x-learnix-client") === "mobile"
}

/** Notifications for the authenticated student, newest first. */
export const listMyNotifications = asyncHandler(async (req, res) => {
  const studentId = studentIdOf(req)
  const filter = { studentId }
  if (isMobileClient(req)) {
    filter.type = { $nin: MOBILE_EXCLUDED_TYPES }
  }
  const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(50)
  res.json(items)
})

export const markRead = asyncHandler(async (req, res) => {
  const studentId = studentIdOf(req)
  const item = await Notification.findById(req.params.id)
  if (!item) throw ApiError.notFound("Notification not found")
  if (item.studentId !== studentId) throw ApiError.forbidden()
  item.read = req.body.read ?? true
  await item.save()
  res.json(item)
})

export const markAllRead = asyncHandler(async (req, res) => {
  const studentId = studentIdOf(req)
  await Notification.updateMany({ studentId, read: false }, { read: true })
  res.json({ ok: true })
})
