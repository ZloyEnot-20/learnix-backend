import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const adminBroadcastSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("brd") },
    orgId: { type: String, required: true, index: true },
    sentById: { type: String, required: true },
    sentByName: { type: String, required: true },
    audience: {
      type: String,
      enum: ["all", "group", "student"],
      required: true,
    },
    audienceId: { type: String, default: null },
    audienceLabel: { type: String, default: null },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 1000 },
    recipientCount: { type: Number, required: true, min: 0 },
  },
  { _id: false, timestamps: true },
)

adminBroadcastSchema.index({ orgId: 1, createdAt: -1 })

adminBroadcastSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id,
    sentById: this.sentById,
    sentByName: this.sentByName,
    audience: this.audience,
    audienceId: this.audienceId ?? null,
    audienceLabel: this.audienceLabel ?? null,
    title: this.title,
    message: this.message,
    recipientCount: this.recipientCount,
    createdAt: this.createdAt,
  }
}

export const AdminBroadcast = mongoose.model("AdminBroadcast", adminBroadcastSchema)
