import "./config/mongoose.js" // must load before any model is compiled
import express from "express"
import cors from "cors"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import path from "path"
import { fileURLToPath } from "url"
import { env, isProd } from "./config/env.js"
import { resolveCorsOptions } from "./utils/cors.js"
import { apiLimiter } from "./middleware/rateLimit.js"
import { notFound, errorHandler } from "./middleware/error.js"
import routes from "./routes/index.js"
import healthRoutes from "./routes/health.routes.js"
import telegramRoutes from "./routes/telegram.routes.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_UPLOADS_DIR = path.join(__dirname, "../uploads")

function apiMount(subpath = "") {
  const base = env.apiPrefix || ""
  if (!subpath) return base || "/"
  return `${base}/${subpath}`.replace(/\/+/g, "/")
}

export function createApp() {
  const app = express()

  // Behind nginx/reverse proxy — correct client IP and secure cookies.
  if (env.trustProxy) {
    app.set("trust proxy", env.trustProxy)
  }

  app.disable("x-powered-by")
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  )
  app.use(cors(resolveCorsOptions({ corsDisabled: env.corsDisabled, corsOriginsRaw: env.corsOrigins })))
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  // Health checks are mounted before the rate limiter so monitoring/uptime
  // probes (and PM2/load balancers) are never throttled.
  app.use(apiMount(), healthRoutes)
  // Telegram webhook — before rate limiter so Telegram POSTs are never throttled.
  app.use(telegramRoutes)

  // Dev fallback for speaking recordings when S3 is unavailable.
  if (!isProd) {
    app.use(apiMount("uploads/files"), express.static(LOCAL_UPLOADS_DIR))
  }

  app.use(apiMount(), apiLimiter, routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
