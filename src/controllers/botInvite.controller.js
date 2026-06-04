import { BotInvite, generateInviteCode } from "../models/BotInvite.js"
import { ParentLink } from "../models/ParentLink.js"
import { Student } from "../models/Student.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

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
  const student = await Student.findById(studentId)
  if (!student) throw ApiError.notFound("Student not found")

  const hours = Math.min(Math.max(Number(ttlHours) || DEFAULT_TTL_HOURS, 1), MAX_TTL_HOURS)
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

  // Retry on the rare unique-code collision.
  let invite
  for (let attempt = 0; attempt < 5 && !invite; attempt++) {
    try {
      invite = await BotInvite.create({
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
  const filter = {}
  if (req.query.studentId) filter.studentId = req.query.studentId
  const invites = await BotInvite.find(filter).sort({ createdAt: -1 }).limit(200)
  res.json(invites.map(serialize))
})

/** Staff: revoke (delete) an invite. */
export const revokeInvite = asyncHandler(async (req, res) => {
  const inv = await BotInvite.findByIdAndDelete(req.params.id)
  if (!inv) throw ApiError.notFound("Invite not found")
  res.json({ ok: true })
})

/** Staff: list active Telegram subscribers (parents) of a student. */
export const listSubscribers = asyncHandler(async (req, res) => {
  const filter = {}
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
  const link = await ParentLink.findByIdAndDelete(req.params.id)
  if (!link) throw ApiError.notFound("Subscriber not found")
  res.json({ ok: true })
})
