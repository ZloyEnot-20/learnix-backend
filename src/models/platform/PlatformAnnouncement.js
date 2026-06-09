import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const platformAnnouncementSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: { type: String, enum: ["news", "maintenance"], default: "news" },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
    /** null or empty = all organizations */
    targetOrgIds: { type: [String], default: null },
    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String },
  },
  { timestamps: true, _id: false },
)

export function getPlatformAnnouncementModel() {
  const conn = getPlatformConnection()
  return (
    conn.models.PlatformAnnouncement ??
    conn.model("PlatformAnnouncement", platformAnnouncementSchema)
  )
}
