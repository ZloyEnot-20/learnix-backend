import { env, isProd } from "./env.js"

const WEAK_JWT_MARKERS = ["change_me", "changeme", "secret", "min-32-chars"]

function looksWeakSecret(value) {
  const v = String(value ?? "").trim().toLowerCase()
  if (!v || v.length < 32) return true
  return WEAK_JWT_MARKERS.some((m) => v.includes(m))
}

/** Fail fast on insecure production configuration. */
export function validateSecurityConfig() {
  if (!isProd) return

  if (looksWeakSecret(env.jwt.accessSecret) || looksWeakSecret(env.jwt.refreshSecret)) {
    throw new Error(
      "[security] Set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (32+ random chars) in production",
    )
  }

  if (env.whisper.enabled && !env.whisper.apiKey) {
    throw new Error("[security] WHISPER_API_KEY is required in production when Whisper is enabled")
  }

  if (env.corsDisabled) {
    console.warn("[security] CORS_DISABLED=true — all browser origins allowed; disable for public production")
  } else if (!env.corsOrigins.trim()) {
    throw new Error(
      "[security] CORS_ORIGINS must be set in production (comma-separated frontend URLs, e.g. https://learnix.tw1.ru)",
    )
  }
}
