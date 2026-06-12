import rateLimit from "express-rate-limit"

/** Strict limiter for authentication endpoints (login / register / refresh). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
})

/** Public entry-test endpoints (phone lookup, no login). */
export const entryTestPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many entry-test requests. Please try again later." },
})

/** Generic limiter for the rest of the API. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
})
