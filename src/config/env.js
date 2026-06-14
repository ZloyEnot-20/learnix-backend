import dotenv from "dotenv"

dotenv.config()

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: process.env.CORS_ORIGINS ?? "",
  /** Proxy hops when behind nginx (rate limit / req.ip). TRUST_PROXY=false to disable. */
  trustProxy:
    process.env.TRUST_PROXY === "false"
      ? false
      : Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? 1 : 0)),
  allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === "true",
  mongoUri: required("MONGODB_URI"),
  dbName: process.env.MONGODB_DB ?? "ielts",
  platformDbName: process.env.PLATFORM_MONGODB_DB ?? "learnix_platform",
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
  },
  seed: {
    // Bootstrap super-admin credentials (used only by `npm run seed`).
    superAdminEmail: process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@example.com",
    superAdminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? "change_me_super_admin_password",
  },
  telegram: {
    // The bot token from @BotFather. Keep it in .env, never in source control.
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    // Public HTTPS URL registered via setWebhook (path must match Express route).
    webhookUrl: (process.env.TELEGRAM_WEBHOOK_URL ?? "").replace(/\/$/, ""),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
    // Notifications are pushed immediately on creation (notify() → telegram.service).
    // This interval is only a fallback reconcile for anything that failed to send.
    reconcileIntervalMs: Number(process.env.TELEGRAM_RECONCILE_INTERVAL_MS ?? 60_000),
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "",
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "ru-1",
    accessKey: process.env.S3_ACCESS_KEY ?? "",
    secretKey: process.env.S3_SECRET_KEY ?? "",
    /** Optional public API base used in locally-stored upload URLs (e.g. http://192.168.1.110:4000). */
    publicApiUrl: process.env.PUBLIC_API_URL ?? "",
    get enabled() {
      return Boolean(this.endpoint && this.bucket && this.accessKey && this.secretKey)
    },
  },
  whisper: {
    /** Base URL of the Python Whisper microservice (e.g. http://127.0.0.1:5001). */
    url: (process.env.WHISPER_SERVICE_URL ?? "http://127.0.0.1:5001").replace(/\/$/, ""),
    /** Shared secret sent as X-API-Key (required in production when Whisper is enabled). */
    apiKey: process.env.WHISPER_API_KEY ?? "",
    model: process.env.WHISPER_MODEL ?? "base",
    language: process.env.WHISPER_LANGUAGE ?? "en",
    /** Request timeout for a single transcription (ms). */
    timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS ?? 120_000),
    get enabled() {
      return Boolean(this.url)
    },
  },
}

export const isProd = env.nodeEnv === "production"
