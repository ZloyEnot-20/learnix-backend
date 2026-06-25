import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** Per-student word mastery within a deck — analytics-friendly aggregate. */
const studentWordProgressSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("swp") },
    orgId: { type: String, index: true, default: null },
    studentId: { type: String, ref: "User", required: true, index: true },
    deckSlug: { type: String, required: true, index: true },
    term: { type: String, required: true },
    correctCount: { type: Number, default: 0 },
    incorrectCount: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    accuracy: { type: Number, default: null },
    masteredAt: { type: Date, default: null },
    wantToLearn: { type: Boolean, default: false },
    lastReviewedAt: { type: Date, default: null },
  },
  { _id: false, timestamps: true },
)

studentWordProgressSchema.index({ studentId: 1, deckSlug: 1, term: 1 }, { unique: true })
studentWordProgressSchema.index({ studentId: 1, masteredAt: 1 })
studentWordProgressSchema.index({ deckSlug: 1, accuracy: 1 })

export const StudentWordProgress = mongoose.model(
  "StudentWordProgress",
  studentWordProgressSchema,
)
