import { Router } from "express"
import {
  getTelegramWebhookPath,
  isTelegramWebhookConfigured,
  verifyTelegramWebhookRequest,
} from "../services/telegram-webhook.service.js"
import { handleTelegramUpdate } from "../bot/telegram-bot.js"

const router = Router()

router.post(getTelegramWebhookPath(), async (req, res) => {
  if (!isTelegramWebhookConfigured()) {
    res.status(503).json({ error: "Telegram webhook is not configured" })
    return
  }

  if (!verifyTelegramWebhookRequest(req)) {
    res.status(403).end()
    return
  }

  res.status(200).end("ok")
  handleTelegramUpdate(req.body).catch((err) =>
    console.error("[telegram] webhook handler error:", err.message),
  )
})

export default router
