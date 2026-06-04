import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const studentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("std") },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    groupId: { type: String, ref: "Group" },
    joinedAt: { type: Date, default: Date.now },
    monthlyFee: { type: Number, min: 0 },
    notes: { type: String, trim: true },
    // Telegram bot link. `telegramId` is the chat id the bot talks to.
    telegramId: { type: String, index: true, sparse: true },
    telegramLinkedAt: { type: Date },
    // Watermark of the last notification already delivered to Telegram, so the
    // poller never sends the same notification twice.
    telegramLastNotifiedAt: { type: Date },
  },
  { _id: false },
)

export const Student = mongoose.model("Student", studentSchema)
