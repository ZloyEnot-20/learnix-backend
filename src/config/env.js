import dotenv from "dotenv"
import path from "node:path"
import { fileURLToPath } from "node:url"

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env")
// Always load project .env (PM2 cwd may differ). override: .env wins over stale PM2 env.
dotenv.config({ path: envPath, override: true })

function required(name) {
  const raw = process.env[name]
  if (raw == null || String(raw).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return String(raw).trim().replace(/^["']|["']$/g, "")
}

function mongoUriFromEnv() {
  const value = required("MONGODB_URI")
  if (!/^mongodb(\+srv)?:\/\//.test(value)) {
    throw new Error(
      `${"MONGODB_URI"} must start with "mongodb://" or "mongodb+srv://" — check ${envPath}`,
    )
  }
  return value
}

/** Express route prefix. Set API_PREFIX= (empty) if nginx strips /api before proxying to Node. */
function apiPrefixFromEnv() {
  if (process.env.API_PREFIX !== undefined) {
    return String(process.env.API_PREFIX).replace(/\/$/, "")
  }
  return "/api"
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  /** Mount path for REST routes (default /api). Empty when the reverse proxy strips /api. */
  apiPrefix: apiPrefixFromEnv(),
  corsOrigins: process.env.CORS_ORIGINS ?? "",
  /** Allow any Origin (CORS_DISABLED=true). Dev/debug only — insecure in production. */
  corsDisabled: process.env.CORS_DISABLED === "true",
  /** Proxy hops when behind nginx (rate limit / req.ip). TRUST_PROXY=false to disable. */
  trustProxy:
    process.env.TRUST_PROXY === "false"
      ? false
      : Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? 1 : 0)),
  allowPublicRegistration: process.env.ALLOW_PUBLIC_REGISTRATION === "true",
  mongoUri: mongoUriFromEnv(),
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
    // Long-polling (local dev): retry delay after getUpdates errors. Ignored when webhook is set.
    pollIntervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 15_000),
    pollTimeoutSec: Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 30),
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
