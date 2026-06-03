import { isProd } from "../config/env.js"
import { ApiError } from "../utils/ApiError.js"

export function notFound(_req, res) {
  res.status(404).json({ error: "Route not found" })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  // Duplicate key (e.g. unique email)
  if (err?.code === 11000) {
    return res.status(409).json({ error: "Resource already exists" })
  }

  // Never expose stack traces or internals in production. Log server-side only,
  // and never log request bodies that may contain credentials.
  console.error("[error]", err?.name, err?.message)
  return res.status(500).json({
    error: "Internal server error",
    ...(isProd ? {} : { hint: err?.message }),
  })
}
