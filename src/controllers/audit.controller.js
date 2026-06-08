import { AuditLog } from "../models/AuditLog.js"
import { asyncHandler } from "../utils/asyncHandler.js"

export const listAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const skip = (page - 1) * limit

  const filter = {}

  if (req.query.category && req.query.category !== "all") {
    filter.category = req.query.category
  }
  if (req.query.action && req.query.action !== "all") {
    filter.action = req.query.action
  }
  if (req.query.actorId) {
    filter.actorId = req.query.actorId
  }

  const search = String(req.query.search ?? "").trim()
  if (search) {
    filter.$or = [
      { actorName: { $regex: search, $options: "i" } },
      { targetLabel: { $regex: search, $options: "i" } },
      { action: { $regex: search, $options: "i" } },
    ]
  }

  if (req.query.from || req.query.to) {
    filter.createdAt = {}
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from)
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to)
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ])

  res.json({
    items: items.map((doc) => doc.toJSON()),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  })
})

export const getAuditCategories = asyncHandler(async (_req, res) => {
  const categories = await AuditLog.distinct("category")
  const actions = await AuditLog.distinct("action")
  res.json({ categories: categories.sort(), actions: actions.sort() })
})
