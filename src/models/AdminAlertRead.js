import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** Tracks which computed admin alerts a staff member has marked as read. */
const adminAlertReadSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("alr") },
    orgId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    alertKey: { type: String, required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

adminAlertReadSchema.index({ orgId: 1, userId: 1, alertKey: 1 }, { unique: true })

export const AdminAlertRead = mongoose.model("AdminAlertRead", adminAlertReadSchema)
