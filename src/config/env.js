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
    // Provide real values via env; the defaults are for first local run only.
    superAdminEmail: process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@ielts.com",
    superAdminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? "super123",
    // Demo student account used by the quick-login button on the sign-in page.
    studentEmail: process.env.SEED_STUDENT_EMAIL ?? "student@ielts.com",
    studentPassword: process.env.SEED_STUDENT_PASSWORD ?? "student123",
  },
  telegram: {
    // The bot token from @BotFather. Keep it in .env, never in source control.
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
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
    get enabled() {
      return Boolean(this.endpoint && this.bucket && this.accessKey && this.secretKey)
    },
  },
}

export const isProd = env.nodeEnv === "production"
