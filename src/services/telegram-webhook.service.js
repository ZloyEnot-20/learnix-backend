/**
 * Telegram webhook — setWebhook via Bot API and validate incoming requests.
 */
import { env } from "../config/env.js"
import { tg } from "./telegram.service.js"

/** Internal Express path for the Telegram webhook POST handler. */
export function getTelegramWebhookPath() {
  const internal = `${env.apiPrefix || ""}/telegram/webhook`.replace(/\/+/g, "/")
  if (!env.telegram.webhookUrl) return internal

  const publicPath = new URL(env.telegram.webhookUrl).pathname
  // nginx often exposes /api/... publicly but forwards /... to Node when API_PREFIX is empty.
  if (!env.apiPrefix && publicPath.startsWith("/api/")) {
    return publicPath.slice("/api".length) || internal
  }
  return publicPath
}

export function isTelegramWebhookConfigured() {
  return Boolean(env.telegram.botToken && env.telegram.webhookUrl)
}

/** Register webhook URL with Telegram (setWebhook). Called on server/bot startup. */
export async function registerTelegramWebhook() {
  if (!env.telegram.botToken) {
    console.warn("[telegram] webhook skipped: TELEGRAM_BOT_TOKEN is not set")
    return null
  }
  if (!env.telegram.webhookUrl) {
    throw new Error(
      "TELEGRAM_WEBHOOK_URL is required (public HTTPS URL, e.g. https://your-host/api/telegram/webhook)",
    )
  }

  const secret = env.telegram.webhookSecret
  const result = await tg("setWebhook", {
    url: env.telegram.webhookUrl,
    allowed_updates: ["message"],
    drop_pending_updates: false,
    ...(secret ? { secret_token: secret } : {}),
  })

  console.log(`[telegram] webhook registered → ${env.telegram.webhookUrl}`)
  return result
}

export async function deleteTelegramWebhook() {
  if (!env.telegram.botToken) return
  await tg("deleteWebhook").catch((err) =>
    console.warn("[telegram] deleteWebhook:", err.message),
  )
}

/** Reject requests without the expected secret header (when TELEGRAM_WEBHOOK_SECRET is set). */
export function verifyTelegramWebhookRequest(req) {
  const secret = env.telegram.webhookSecret
  if (!secret) return true
  return req.headers["x-telegram-bot-api-secret-token"] === secret
}
