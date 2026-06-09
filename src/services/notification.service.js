import { Notification } from "../models/Notification.js"
import { User } from "../models/User.js"
import { deliverNotification } from "./telegram.service.js"

// Telegramga darhol yuborish — fire-and-forget. Bu yerda xatolarni yutamiz,
// chunki bildirishnoma yuborilishi asosiy amalni hech qachon buzmasligi kerak.
function pushToTelegram(note) {
  if (!note) return
  deliverNotification(note).catch((err) =>
    console.error("[notify] telegram push error:", err.message),
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
  for (const note of created) pushToTelegram(note)
}
