import { createApp } from "./app.js"
import { connectDB, disconnectDB } from "./config/db.js"
import { connectPlatformDB, disconnectPlatformDB } from "./config/platformDb.js"
import { env } from "./config/env.js"

function start() {
  const app = createApp()

  // Start listening immediately so the process is reachable (and health checks
  // respond) even if MongoDB is temporarily unavailable. The DB connects in the
  // background; /api/health/ready reflects whether it's actually ready.
  const server = app.listen(env.port, () => {
    console.log(`[server] API listening on http://localhost:${env.port}/api`)
    console.log(`[server] health: http://localhost:${env.port}/api/health`)
  })

  connectDB().catch((err) => {
    console.error("[db] initial connection failed:", err?.message)
    console.error("[db] is MongoDB running? Check MONGODB_URI in .env")
  })

  connectPlatformDB().catch((err) => {
    console.error("[db] platform connection failed:", err?.message)
  })

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`)
    server.close(async () => {
      await Promise.all([disconnectDB().catch(() => {}), disconnectPlatformDB().catch(() => {})])
      process.exit(0)
    })
  }
  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

start()
