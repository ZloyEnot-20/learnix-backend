import express from "express"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import { env, isProd } from "./config/env.js"
import { apiLimiter } from "./middleware/rateLimit.js"
import { notFound, errorHandler } from "./middleware/error.js"
import routes from "./routes/index.js"

export function createApp() {
  const app = express()

  app.disable("x-powered-by")
  app.use(helmet())
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin/non-browser (no Origin header) and whitelisted origins.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true)
        return cb(new Error("Not allowed by CORS"))
      },
      credentials: true,
    }),
  )
  app.use(express.json({ limit: "1mb" }))
  app.use(cookieParser())

  // Request logging — `morgan` does not log request bodies, so no secrets leak.
  app.use(morgan(isProd ? "combined" : "dev"))

  app.use("/api", apiLimiter, routes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
