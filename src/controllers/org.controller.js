import { connectPlatformDB } from "../config/platformDb.js"
import { getOrganizationModel } from "../models/platform/Organization.js"
import { getSubscriptionModel } from "../models/platform/Subscription.js"
import { getPlatformPaymentModel } from "../models/platform/PlatformPayment.js"
import { getPlatformAnnouncementModel } from "../models/platform/PlatformAnnouncement.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { resolveOrgId } from "../services/tenantScope.service.js"
import { computeOrgLeaderboard } from "../services/gamification.service.js"
import { recordAudit } from "../services/audit.service.js"
import { formatOrgSettings, getOrgSettings as fetchOrgSettings } from "../services/orgSettings.service.js"

async function ensurePlatformDb() {
  await connectPlatformDB()
}

function activeAnnouncementFilter(orgId) {
  const now = new Date()
  return {
    isActive: true,
    startsAt: { $lte: now },
    $and: [
      {
        $or: [
          { endsAt: null },
          { endsAt: { $exists: false } },
          { endsAt: { $gte: now } },
        ],
      },
      {
        $or: [
          { targetOrgIds: null },
          { targetOrgIds: { $exists: false } },
          { targetOrgIds: { $size: 0 } },
          { targetOrgIds: orgId },
        ],
      },
    ],
  }
}

function formatAnnouncement(doc) {
  return {
    id: doc._id,
    title: doc.title,
    message: doc.message,
    type: doc.type,
    severity: doc.severity,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt ?? null,
  }
}

/** Read-only subscription and payment info for the current organization. */
export const getOrgBilling = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  await ensurePlatformDb()
  const Organization = getOrganizationModel()
  const Subscription = getSubscriptionModel()
  const PlatformPayment = getPlatformPaymentModel()

  const [org, subscription, payments] = await Promise.all([
    Organization.findById(orgId).lean(),
    Subscription.findOne({ orgId }).sort({ createdAt: -1 }).lean(),
    PlatformPayment.find({ orgId }).sort({ createdAt: -1 }).limit(20).lean(),
  ])

  if (!org) throw ApiError.notFound("Organization not found")

  res.json({
    organization: {
      id: org._id,
      name: org.name,
      subdomain: org.subdomain,
      status: org.status,
      plan: org.plan,
      limits: org.limits ?? { maxStudents: 50, maxTeachers: 5 },
      trialEndsAt: org.trialEndsAt ?? null,
    },
    subscription: subscription
      ? {
          id: subscription._id,
          plan: subscription.plan,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt ?? null,
          currentPeriodStart: subscription.currentPeriodStart ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          canceledAt: subscription.canceledAt ?? null,
        }
      : null,
    payments: payments.map((p) => ({
      id: p._id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      periodLabel: p.periodLabel,
      paidAt: p.paidAt ?? null,
      createdAt: p.createdAt,
    })),
  })
})

/** Active platform announcements for the tenant admin banner. */
export const getOrgBanner = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  await ensurePlatformDb()
  const PlatformAnnouncement = getPlatformAnnouncementModel()

  const items = await PlatformAnnouncement.find(activeAnnouncementFilter(orgId))
    .sort({ type: -1, severity: -1, createdAt: -1 })
    .limit(5)
    .lean()

  res.json(items.map(formatAnnouncement))
})

/** Top students in the current organization by XP. */
export const getOrgLeaderboard = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  const entries = await computeOrgLeaderboard(orgId, 30)
  res.json(entries)
})

/** Organization settings for staff UI and mobile homework sessions. */
export const getOrgSettings = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  await ensurePlatformDb()
  const Organization = getOrganizationModel()
  const org = await Organization.findById(orgId).lean()
  if (!org) throw ApiError.notFound("Organization not found")

  res.json(formatOrgSettings(org))
})

/** Update organization settings (org admin only). */
export const updateOrgSettings = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  const { allowScreenshots, entryTestAutocomplete } = req.body

  await ensurePlatformDb()
  const Organization = getOrganizationModel()
  const org = await Organization.findById(orgId).lean()
  if (!org) throw ApiError.notFound("Organization not found")

  const previous = formatOrgSettings(org)
  const $set = {}
  const details = {}

  if (allowScreenshots !== undefined) {
    $set["settings.allowScreenshots"] = allowScreenshots
    details.allowScreenshots = { from: previous.allowScreenshots, to: allowScreenshots }
  }
  if (entryTestAutocomplete !== undefined) {
    $set["settings.entryTestAutocomplete"] = entryTestAutocomplete
    details.entryTestAutocomplete = {
      from: previous.entryTestAutocomplete,
      to: entryTestAutocomplete,
    }
  }

  await Organization.findByIdAndUpdate(orgId, { $set })

  await recordAudit({
    req,
    action: "org.settings_updated",
    category: "settings",
    targetType: "organization",
    targetId: orgId,
    targetLabel: org.name,
    details,
  })

  res.json(await fetchOrgSettings(orgId))
})
