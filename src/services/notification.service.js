import { Notification } from "../models/Notification.js"

/**
 * Create a notification for a single student. Best-effort: notification
 * failures must never break the primary action, so callers should not await
 * this in a way that propagates errors.
 */
export async function notify(studentId, { type, title, message }) {
  if (!studentId) return null
  return Notification.create({ studentId, type, title, message })
}

/** Create the same notification for many students (e.g. a whole group). */
export async function notifyMany(studentIds, { type, title, message }) {
  const ids = (studentIds ?? []).filter(Boolean)
  if (ids.length === 0) return
  const docs = ids.map((studentId) => ({ studentId, type, title, message }))
  await Notification.insertMany(docs, { ordered: false }).catch(() => {})
}
