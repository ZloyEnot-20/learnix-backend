/**
 * One-time (or on URL change): register TELEGRAM_WEBHOOK_URL with Telegram setWebhook.
 * Run: npm run bot:webhook
 */
import { registerTelegramWebhook } from "../services/telegram-webhook.service.js"

registerTelegramWebhook()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[telegram] webhook registration failed:", err.message)
    process.exit(1)
  })
