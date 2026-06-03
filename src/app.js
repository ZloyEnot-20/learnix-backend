import "./config/mongoose.js" // must load before any model is compiled
import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { isProd } from "./config/env.js"
import { apiLimiter } from "./middleware/rateLimit.js"
import { notFound, errorHandler } from "./middleware/error.js"
import routes from "./routes/index.js"
import healthRoutes from "./routes/health.routes.js"

export function createApp() {
  const app = express()

  app.disable("x-powered-by")
  app.use(helmet())
  app.use(
    cors({
      // Allow all origins. The request origin is reflected back (instead of "*")
      // so it stays compatible with `credentials`. Auth uses Bearer tokens, not
      // cookies, so reflecting any origin does not expose session cookies.
      origin: true,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  // Request logging — `morgan` does not log request bodies, so no secrets leak.
  app.use(morgan(isProd ? "combined" : "dev"))

  // Health checks are mounted before the rate limiter so monitoring/uptime
  // probes (and PM2/load balancers) are never throttled.
  app.use("/api", healthRoutes)

  app.use("/api", apiLimiter, routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
