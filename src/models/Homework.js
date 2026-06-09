import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const homeworkSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("hw") },
    orgId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    subject: {
      type: String,
      enum: ["reading", "listening", "writing", "speaking", "grammar", "vocabulary"],
      required: true,
    },
    groupId: { type: String, ref: "Group", required: true },
    dueAt: { type: Date, required: true },
    estimatedMinutes: { type: Number, default: 0, min: 0 },
    createdBy: { type: String, default: "System" },
    exerciseSlug: { type: String },
    timeLimitMinutes: { type: Number, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const Homework = mongoose.model("Homework", homeworkSchema)
