import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/**
 * A link between a parent's Telegram chat and a student. A single chat can
 * follow several children, and a child can be followed by several chats
 * (e.g. both parents) — hence a separate collection instead of a field on
 * the Student.
 *
 * `lastNotifiedAt` is the watermark of the most recent notification already
 * delivered to this chat for this student, so the poller never double-sends.
 */
const parentLinkSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("plink") },
    chatId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "Student", required: true, index: true },
    parentName: { type: String, trim: true },
    // Telegramdan olingan (agar mavjud bo'lsa): @username va kontakt orqali telefon.
    username: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    lastNotifiedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

// A given chat links to a given student at most once.
parentLinkSchema.index({ chatId: 1, studentId: 1 }, { unique: true })

export const ParentLink = mongoose.model("ParentLink", parentLinkSchema)
