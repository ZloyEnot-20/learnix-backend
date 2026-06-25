import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** Per-student deck engagement aggregate. */
const studentDeckProgressSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("sdp") },
    orgId: { type: String, index: true, default: null },
    studentId: { type: String, ref: "User", required: true, index: true },
    deckSlug: { type: String, required: true, index: true },
    deckTitle: { type: String, default: "" },
    quizAttempts: { type: Number, default: 0 },
    quizCorrectSum: { type: Number, default: 0 },
    bestAccuracy: { type: Number, default: null },
    wordsMastered: { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

studentDeckProgressSchema.index({ studentId: 1, deckSlug: 1 }, { unique: true })
studentDeckProgressSchema.index({ deckSlug: 1, quizAttempts: -1 })

export const StudentDeckProgress = mongoose.model(
  "StudentDeckProgress",
  studentDeckProgressSchema,
)
