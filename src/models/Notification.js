import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("ntf") },
    studentId: { type: String, ref: "Student", required: true, index: true },
    type: {
      type: String,
      enum: ["homework", "result", "reminder", "achievement", "system", "entry_test"],
      default: "system",
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    read: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
)

notificationSchema.index({ studentId: 1, createdAt: -1 })

export const Notification = mongoose.model("Notification", notificationSchema)
