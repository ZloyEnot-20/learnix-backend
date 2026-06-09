import { BotInvite, generateInviteCode } from "../models/BotInvite.js"
import { ParentLink } from "../models/ParentLink.js"
import { StudentClaim } from "../models/StudentClaim.js"
import { User } from "../models/User.js"
import { findStudentById } from "../services/student.service.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import {
  assertStudentInOrg,
  assertTenantDoc,
  tenantFilter,
} from "../services/tenantScope.service.js"

const DEFAULT_TTL_HOURS = 72
const MAX_TTL_HOURS = 24 * 30

/** Derived status for the UI, computed from timestamps. */
function inviteStatus(inv) {
  if (inv.usedAt) return "used"
  if (new Date(inv.expiresAt).getTime() < Date.now()) return "expired"
  return "active"
}

function serialize(inv) {
  return {
    id: inv._id,
    code: inv.code,
    studentId: inv.studentId,
    createdBy: inv.createdBy,
    expiresAt: inv.expiresAt,
    usedAt: inv.usedAt,
    parentName: inv.parentName,
    createdAt: inv.createdAt,
    status: inviteStatus(inv),
  }
}

/** Staff: create a one-time invite code for a student. */
export const createInvite = asyncHandler(async (req, res) => {
  const { studentId, ttlHours } = req.body
  const student = await assertStudentInOrg(studentId, req)
  if (!student) throw ApiError.notFound("Student not found")

  const hours = Math.min(Math.max(Number(ttlHours) || DEFAULT_TTL_HOURS, 1), MAX_TTL_HOURS)
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

  // Retry on the rare unique-code collision.
  let invite
  for (let attempt = 0; attempt < 5 && !invite; attempt++) {
    try {
      invite = await BotInvite.create({
        orgId: student.orgId,
        code: generateInviteCode(),
        studentId,
        createdBy: req.user?.name ?? "Staff",
        expiresAt,
      })
    } catch (err) {
      if (err?.code !== 11000) throw err
    }
  }
  if (!invite) throw ApiError.conflict("Could not generate a unique code, try again")

  res.status(201).json(serialize(invite))
})

/** Staff: list invites, optionally filtered by student. */
export const listInvites = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.studentId) filter.studentId = req.query.studentId
  const invites = await BotInvite.find(filter).sort({ createdAt: -1 }).limit(200)
  res.json(invites.map(serialize))
})

/** Staff: revoke (delete) an invite. */
export const revokeInvite = asyncHandler(async (req, res) => {
  const inv = await assertTenantDoc(BotInvite, req.params.id, req)
  await BotInvite.findByIdAndDelete(inv._id)
  res.json({ ok: true })
})

/** Staff: list active Telegram subscribers (parents) of a student. */
export const listSubscribers = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.studentId) filter.studentId = req.query.studentId
  const links = await ParentLink.find(filter).sort({ createdAt: -1 })
  res.json(
    links.map((l) => ({
      id: l._id,
      studentId: l.studentId,
      parentName: l.parentName,
      username: l.username ?? null,
      phone: l.phone ?? null,
      createdAt: l.createdAt,
    })),
  )
})

/** Staff: remove a parent's subscription. */
export const removeSubscriber = asyncHandler(async (req, res) => {
  const link = await assertTenantDoc(ParentLink, req.params.id, req)
  await ParentLink.findByIdAndDelete(link._id)
  res.json({ ok: true })
})

/** Derived status for a student confirmation code. */
function claimStatus(claim) {
  if (claim.usedAt) return "used"
  if (new Date(claim.expiresAt).getTime() < Date.now()) return "expired"
  return "active"
}

/**
 * Staff: list a student's confirmation codes (used to deliver their login +
 * password via the bot). The plaintext password is never returned.
 */
export const listClaims = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.studentId) filter.studentId = req.query.studentId
  const claims = await StudentClaim.find(filter).sort({ createdAt: -1 }).limit(200)
  res.json(
    claims.map((c) => ({
      id: c._id,
      studentId: c.studentId,
      code: c.code,
      expiresAt: c.expiresAt,
      usedAt: c.usedAt,
      createdAt: c.createdAt,
      status: claimStatus(c),
    })),
  )
})
