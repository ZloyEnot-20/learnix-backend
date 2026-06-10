import jwt from "jsonwebtoken"
import { env } from "../config/env.js"

/**
 * Tokens carry the minimum needed for authz: the subject (user id) and type.
 * No emails, names or other PII are placed inside the JWT.
 */
export function signAccessToken(user) {
  return jwt.sign({ type: user.type }, env.jwt.accessSecret, {
    subject: String(user._id),
    expiresIn: env.jwt.accessTtl,
  })
}

export function signRefreshToken(user) {
  return jwt.sign({ tokenKind: "refresh" }, env.jwt.refreshSecret, {
    subject: String(user._id),
    expiresIn: env.jwt.refreshTtl,
  })
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret)
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret)
}
