import { Router } from "express"
import mongoose from "mongoose"

const router = Router()

const DB_STATES = ["disconnected", "connected", "connecting", "disconnecting"]

/** Liveness: process is up and serving requests. */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), ts: Date.now() })
})

/** Readiness: up AND the database is reachable. Returns 503 if DB is down. */
router.get("/health/ready", async (_req, res) => {
  const state = mongoose.connection.readyState
  const dbConnected = state === 1
  let dbPing = false
  if (dbConnected) {
    try {
      await mongoose.connection.db.admin().ping()
      dbPing = true
    } catch {
      dbPing = false
    }
  }

  const healthy = dbConnected && dbPing
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptime: process.uptime(),
    db: { state: DB_STATES[state] ?? "unknown", ping: dbPing },
    ts: Date.now(),
  })
})

export default router
