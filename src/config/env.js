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
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
    refreshTtl: process.env.JWT_REFRESH_TTL ?? "30d",
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  seed: {
    superAdminPassword: process.env.SEED_SUPERADMIN_PASSWORD ?? "super123",
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? "admin123",
    teacherPassword: process.env.SEED_TEACHER_PASSWORD ?? "teacher123",
    studentPassword: process.env.SEED_STUDENT_PASSWORD ?? "student123",
  },
}

export const isProd = env.nodeEnv === "production"
