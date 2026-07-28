import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { tenantFilter } from "../services/tenantScope.service.js"
import {
  getDashboardStats,
  listTeachersOverview,
  listHomeworkReviewQueue,
  sendBroadcast,
  listBroadcastHistory,
  listAdminAlerts,
  markAlertRead,
  markAllAlertsRead,
} from "../services/admin.service.js"

export const dashboard = asyncHandler(async (req, res) => {
  const stats = await getDashboardStats(tenantFilter(req))
  res.json(stats)
})

export const teachers = asyncHandler(async (req, res) => {
  const rows = await listTeachersOverview(tenantFilter(req))
  res.json(rows)
})

export const homeworkReviewQueue = asyncHandler(async (req, res) => {
  const rows = await listHomeworkReviewQueue(tenantFilter(req))
  res.json(rows)
})

export const broadcastNotification = asyncHandler(async (req, res) => {
  const { audience, audienceId, title, message } = req.body
  try {
    const record = await sendBroadcast({
      orgId: req.user.orgId,
      sentBy: { id: req.user.id, name: req.user.name },
      audience,
      audienceId,
      title: title.trim(),
      message: message.trim(),
    })
    res.status(201).json(record)
  } catch (err) {
    throw ApiError.badRequest(err.message ?? "Could not send notification")
  }
})

export const broadcastHistory = asyncHandler(async (req, res) => {
  const rows = await listBroadcastHistory(tenantFilter(req))
  res.json(rows)
})

export const alerts = asyncHandler(async (req, res) => {
  const rows = await listAdminAlerts(tenantFilter(req), req.user.id)
  res.json(rows)
})

export const readAlert = asyncHandler(async (req, res) => {
  await markAlertRead(tenantFilter(req), req.user.id, req.body.alertKey)
  res.json({ ok: true })
})

export const readAllAlerts = asyncHandler(async (req, res) => {
  const keys = Array.isArray(req.body?.alertKeys) ? req.body.alertKeys : []
  await markAllAlertsRead(tenantFilter(req), req.user.id, keys)
  res.json({ ok: true })
})
