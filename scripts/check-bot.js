/**
 * Telegram bot diagnostics (run on VPS). Usage: npm run bot:check
 */
import { env } from "../src/config/env.js"
import { tg } from "../src/services/telegram.service.js"

async function main() {
  console.log("=== Telegram bot diagnostics ===\n")

  if (!env.telegram.botToken) {
    console.log("FAIL: TELEGRAM_BOT_TOKEN is not set in .env")
    process.exit(1)
  }

  try {
    const me = await tg("getMe", {})
    console.log("Token: OK  →  @" + me.username)
  } catch (err) {
    console.log("Token: FAIL  →", err.message)
    process.exit(1)
  }

  const expected = env.telegram.webhookUrl
  const useWebhook = env.telegram.useWebhook
  console.log("TELEGRAM_WEBHOOK_URL (.env):", expected || "(not set)")
  console.log("Active mode:", useWebhook ? "webhook" : "polling (development default)")

  try {
    const info = await tg("getWebhookInfo", {})
    const registered = info.url || ""
    console.log("Webhook (Telegram):", registered || "(not registered — run: npm run bot:webhook)")

    if (useWebhook && expected && registered && registered !== expected) {
      console.log("\nMISMATCH: Telegram has a different URL than .env")
      console.log("  Fix: npm run bot:webhook")
    }
    if (useWebhook && expected && !registered) {
      console.log("\nWebhook not registered. On VPS after deploy run: npm run bot:webhook")
    }
    if (info.last_error_message) {
      console.log("\nTelegram delivery error:", info.last_error_message)
      console.log("  → Usually nginx/SSL/backend down or wrong URL")
    }
    if (info.pending_update_count > 0) {
      console.log("Pending updates (not delivered):", info.pending_update_count)
    }
  } catch (err) {
    console.log("getWebhookInfo FAIL:", err.message)
  }

  console.log(
    "\nWebhook secret:",
    env.telegram.webhookSecret ? "set (TELEGRAM_WEBHOOK_SECRET)" : "not set",
  )

  if (useWebhook) {
    console.log("\nMode: webhook — messages go to ielts-backend (POST webhook).")
  } else {
    console.log("\nMode: polling — ielts-bot calls getUpdates (webhook ignored in development).")
    if (expected) {
      console.log("  TELEGRAM_WEBHOOK_URL is kept for production; set TELEGRAM_USE_WEBHOOK=true to test webhook locally.")
    }
  }
  console.log("Both processes need MongoDB — if API login fails, bot will fail too.")
  console.log("Run: npm run db:check")
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
