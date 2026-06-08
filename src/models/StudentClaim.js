import mongoose from "mongoose"
import { randomInt } from "node:crypto"
import { uid } from "../utils/ids.js"

/** Generate a 6-digit numeric one-time code (e.g. "048213"). */
export function generateClaimCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/**
 * One-time confirmation code a student enters in the Telegram bot to receive
 * their login + password. The plaintext password is stored ONLY until the code
 * is redeemed (or it expires) and is cleared on use — never logged or exposed
 * through any API.
 */
const studentClaimSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("claim") },
    studentId: { type: String, ref: "User", required: true, index: true },
    code: { type: String, required: true, index: true },
    // Temporary plaintext password, delivered once via the bot then cleared.
    password: { type: String, select: false, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedByChatId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// Auto-purge expired/used claims (and their plaintext) shortly after expiry.
studentClaimSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const StudentClaim = mongoose.model("StudentClaim", studentClaimSchema)
