import { createApp } from "./app.js"
import { connectDB, disconnectDB } from "./config/db.js"
import { connectPlatformDB, disconnectPlatformDB } from "./config/platformDb.js"
import { env } from "./config/env.js"
import { validateSecurityConfig } from "./config/securityCheck.js"
import { initializeFirebase } from "./config/firebase.js"
import {
  isTelegramWebhookConfigured,
  registerTelegramWebhook,
} from "./services/telegram-webhook.service.js"
import { startReconcileTimer } from "./services/telegram.service.js"

function start() {
  validateSecurityConfig()
  const app = createApp()

  // Start listening immediately so the process is reachable (and health checks
  // respond) even if MongoDB is temporarily unavailable. The DB connects in the
  // background; /api/health/ready reflects whether it's actually ready.
  const server = app.listen(env.port, () => {
    const prefix = env.apiPrefix || "(root)"
    console.log(`[server] API listening on http://localhost:${env.port}${env.apiPrefix || ""}`)
    console.log(`[server] health: http://localhost:${env.port}${env.apiPrefix}/health`)
    console.log(`[server] API_PREFIX=${prefix}`)
    console.log(`[server] MongoDB target db: ${env.dbName} (+ ${env.platformDbName})`)
  })

  let stopReconcile = () => {}

  connectDB()
    .then(async () => {
      if (env.firebase.enabled) {
        const messaging = initializeFirebase()
        if (messaging) {
          console.log("[firebase] FCM enabled")
        } else {
          console.warn("[firebase] credentials present but initialization failed")
        }
      }
      if (isTelegramWebhookConfigured()) {
        await registerTelegramWebhook().catch((err) =>
          console.error("[telegram] webhook registration failed:", err.message),
        )
        stopReconcile = startReconcileTimer()
        console.log("[telegram] webhook mode — updates via POST webhook, reconcile in backend")
      }
    })
    .catch(() => {
      /* connectDB already logged root cause via logMongoConnectError */
    })

  connectPlatformDB().catch(() => {
    /* connectPlatformDB already logged root cause */
  })

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`)
    stopReconcile()
    server.close(async () => {
      await Promise.all([disconnectDB().catch(() => {}), disconnectPlatformDB().catch(() => {})])
      process.exit(0)
    })
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

start()
