import { isProd } from "../config/env.js"

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]

/** Parse comma-separated CORS_ORIGINS; in production at least one origin is required. */
export function parseCorsOrigins(raw = process.env.CORS_ORIGINS ?? "", { corsDisabled = false } = {}) {
  if (corsDisabled) return []

  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  if (origins.length > 0) return origins
  if (!isProd) return DEV_ORIGINS
  throw new Error("CORS_ORIGINS must be set in production (comma-separated frontend URLs)")
}

export function createCorsOptions(origins) {
  return {
    origin(origin, callback) {
      // Same-origin / server-to-server / curl — no Origin header.
      if (!origin) return callback(null, true)
      if (origins.includes(origin)) return callback(null, true)
      callback(null, false)
    },
    credentials: true,
  }
}

/** Strict allow-list or permissive mode when CORS_DISABLED=true. */
export function resolveCorsOptions({ corsDisabled = false, corsOriginsRaw = "" } = {}) {
  if (corsDisabled) {
    return { origin: true, credentials: true }
  }
  return createCorsOptions(parseCorsOrigins(corsOriginsRaw, { corsDisabled }))
}
