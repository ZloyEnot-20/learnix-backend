import mongoose from "mongoose"
import { randomInt } from "node:crypto"
import { uid } from "../utils/ids.js"

// Unambiguous alphabet (no 0/O/1/I/L) for human-friendly, one-time codes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** Generate an 8-char invite code, e.g. "QK7M2P9D". */
export function generateInviteCode(length = 8) {
  let code = ""
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/** Normalise user input ("qk7m-2p9d" → "QK7M2P9D") for comparison. */
export function normaliseInviteCode(input) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
}

const botInviteSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("inv") },
    orgId: { type: String, required: true, index: true },
    code: { type: String, required: true, unique: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    createdBy: { type: String, default: "System" },
    expiresAt: { type: Date, required: true },
    // One-time use: set when a parent redeems the code via the bot.
    usedAt: { type: Date, default: null },
    usedByChatId: { type: String, default: null },
    parentName: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const BotInvite = mongoose.model("BotInvite", botInviteSchema)
