import { Notification } from "../models/Notification.js"
import { User } from "../models/User.js"
import { deliverPushNotification } from "./fcm.service.js"
import { deliverNotification, shouldDeliverTelegram } from "./telegram.service.js"

/** Stored in DB + Telegram only — never FCM / mobile push. */
const TELEGRAM_ONLY_NOTIFICATION_TYPES = new Set(["attendance"])

function pushToMobile(note) {
  if (!note) return
  if (TELEGRAM_ONLY_NOTIFICATION_TYPES.has(note.type)) return
  deliverPushNotification(note).catch((err) =>
    console.error("[notify] fcm push error:", err.message),
  )
}

function pushToTelegram(note) {
  if (!note) return
  if (!shouldDeliverTelegram(note)) return
  deliverNotification(note).catch((err) =>
    console.error("[notify] telegram error:", err.message),
  )
}

/**
 * Create a notification for a single student. Best-effort: notification
 * failures must never break the primary action, so callers should not await
 * this in a way that propagates errors.
 */
export async function notify(studentId, { type, title, message, data = {} }) {
  if (!studentId) return null
  const student = await User.findById(studentId).select("orgId")
  const note = await Notification.create({
    orgId: student?.orgId,
    studentId,
    type,
    title,
    message,
    data,
  })
  pushToMobile(note)
  pushToTelegram(note)
  return note
}

/** Create the same notification for many students (e.g. a whole group). */
export async function notifyMany(studentIds, { type, title, message, data = {} }) {
  const ids = (studentIds ?? []).filter(Boolean)
  if (ids.length === 0) return
  const students = await User.find({ _id: { $in: ids } }).select("_id orgId").lean()
  const orgById = new Map(students.map((s) => [s._id, s.orgId]))
  const docs = ids.map((studentId) => ({
    orgId: orgById.get(studentId) ?? null,
    studentId,
    type,
    title,
    message,
    data,
  }))
  const created = await Notification.insertMany(docs, { ordered: false }).catch(() => [])
  for (const note of created) {
    pushToMobile(note)
    pushToTelegram(note)
  }
}
