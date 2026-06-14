import { isProd } from "../config/env.js"
import { ApiError } from "../utils/ApiError.js"

export function notFound(req, res) {
  console.warn(`[404] ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    hint: "API routes are mounted under the configured API_PREFIX (default /api). If nginx strips /api, set API_PREFIX= in .env.",
  })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  // Duplicate key (unique login/email within org)
  if (err?.code === 11000) {
    const keyPattern = err.keyPattern ?? {}
    const keyValue = err.keyValue ?? {}
    const fields = Object.keys(keyPattern)

    if (fields.includes("login")) {
      const login = keyValue.login
      return res.status(409).json({
        error: login
          ? `Login "${login}" is already taken in this organization`
          : "Login is already taken in this organization",
      })
    }

    if (fields.includes("email")) {
      const email = keyValue.email
      if (email == null || email === "") {
        return res.status(409).json({
          error:
            "Only one student without email is allowed per organization (database index issue). Restart the API server, or add an email to this student.",
        })
      }
      return res.status(409).json({
        error: `Email "${email}" is already registered in this organization`,
      })
    }

    return res.status(409).json({
      error: "A user with these details already exists",
      details: isProd ? undefined : { keyPattern, keyValue },
    })
  }

  // Never expose stack traces or internals in production. Log server-side only,
  // and never log request bodies that may contain credentials.
  console.error("[error]", err?.name, err?.message)
  return res.status(500).json({
    error: "Internal server error",
    ...(isProd ? {} : { hint: err?.message }),
  })
}
