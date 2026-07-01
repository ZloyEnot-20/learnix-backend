import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/**
 * FCM device tokens for student mobile apps. One student may have several
 * devices; each token is globally unique (one document per device install).
 */
const pushTokenSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("ptok") },
    orgId: { type: String, index: true, default: null },
    studentId: { type: String, ref: "User", required: true, index: true },
    token: { type: String, required: true, trim: true },
    platform: { type: String, enum: ["ios", "android"], required: true },
    lastUsedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

pushTokenSchema.index({ token: 1 }, { unique: true })
pushTokenSchema.index({ studentId: 1, lastUsedAt: -1 })

export const PushToken = mongoose.model("PushToken", pushTokenSchema)
