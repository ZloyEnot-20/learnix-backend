import { isProd } from "../config/env.js"

const WEAK_PASSWORDS = new Set([
  "super123",
  "student123",
  "admin123",
  "demo123",
  "change_me_super_admin_password",
])

const WEAK_MARKERS = ["change_me", "changeme", "password", "admin123", "super123"]

export function assertSeedPassword(label, password) {
  if (!isProd) return
  const value = String(password ?? "").trim()
  if (!value || value.length < 12) {
    throw new Error(`[seed] In production set a strong ${label} (min 12 characters) via env`)
  }
  if (WEAK_PASSWORDS.has(value)) {
    throw new Error(`[seed] In production ${label} must not use a default/weak password`)
  }
  const lower = value.toLowerCase()
  if (WEAK_MARKERS.some((m) => lower.includes(m))) {
    throw new Error(`[seed] In production ${label} looks weak — choose a unique secret`)
  }
}
