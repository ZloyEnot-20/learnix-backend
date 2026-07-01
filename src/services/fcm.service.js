import { getMessaging } from "../config/firebase.js"
import {
  deletePushToken,
  listPushTokensForStudent,
} from "./push-token.service.js"

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
])

/** Attendance alerts go to parents via Telegram, not the student mobile app. */
const MOBILE_HIDDEN_NOTIFICATION_TYPES = new Set(["attendance"])

function stringifyDataPayload(data) {
  const out = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined || value === null) continue
    out[key] = typeof value === "string" ? value : JSON.stringify(value)
  }
  return out
}

function buildMessage(token, { title, body, data }) {
  const message = {
    token,
    data: stringifyDataPayload(data),
  }
  if (title) message.notification = { title, body: body ?? "" }
  return message
}

function handleSendError(err, token) {
  if (err?.code && INVALID_TOKEN_CODES.has(err.code)) {
    return deletePushToken(token)
  }
  return undefined
}

/**
 * Send a push notification to a single FCM device token.
 */
export async function sendToToken(token, { title, body, data = {} } = {}) {
  const messaging = getMessaging()
  if (!messaging) return { ok: false, skipped: true, reason: "firebase_disabled" }

  try {
    const messageId = await messaging.send(buildMessage(token, { title, body, data }))
    return { ok: true, messageId }
  } catch (err) {
    await handleSendError(err, token)
    return { ok: false, error: err.message, code: err.code }
  }
}

/**
 * Send the same notification to several device tokens (one user, multiple devices).
 */
export async function sendToTokens(tokens, { title, body, data = {} } = {}) {
  const unique = [...new Set((tokens ?? []).filter(Boolean))]
  if (unique.length === 0) return { ok: true, sent: 0, failed: 0 }

  const messaging = getMessaging()
  if (!messaging) return { ok: false, skipped: true, reason: "firebase_disabled", sent: 0 }

  if (unique.length === 1) {
    try {
      const result = await sendToToken(unique[0], { title, body, data })
      return { ok: result.ok, sent: result.ok ? 1 : 0, failed: result.ok ? 0 : 1 }
    } catch {
      return { ok: false, sent: 0, failed: 1 }
    }
  }

  const response = await messaging.sendEachForMulticast({
    tokens: unique,
    notification: title ? { title, body: body ?? "" } : undefined,
    data: stringifyDataPayload(data),
  })

  const invalidTokens = []
  response.responses.forEach((item, index) => {
    if (item.success) return
    const code = item.error?.code
    if (code && INVALID_TOKEN_CODES.has(code)) {
      invalidTokens.push(unique[index])
    }
  })

  if (invalidTokens.length > 0) {
    await Promise.all(invalidTokens.map((token) => deletePushToken(token)))
  }

  return {
    ok: response.failureCount === 0,
    sent: response.successCount,
    failed: response.failureCount,
  }
}

/**
 * Send a push notification to every registered device of a student.
 */
export async function sendToStudent(studentId, { title, body, data = {} } = {}) {
  const rows = await listPushTokensForStudent(studentId)
  const tokens = rows.map((row) => row.token)
  return sendToTokens(tokens, { title, body, data })
}

/**
 * Deliver an in-app Notification document to the student's mobile devices.
 * Mirrors the fire-and-forget pattern used for Telegram delivery.
 */
export async function deliverPushNotification(note) {
  if (!note?.studentId) return
  if (MOBILE_HIDDEN_NOTIFICATION_TYPES.has(note.type)) return
  if (!getMessaging()) return

  const tokens = (await listPushTokensForStudent(note.studentId)).map((row) => row.token)
  if (tokens.length === 0) return

  await sendToTokens(tokens, {
    title: note.title,
    body: note.message ?? "",
    data: {
      notificationId: note._id,
      type: note.type,
      ...(note.data && typeof note.data === "object" ? note.data : {}),
    },
  })
}
