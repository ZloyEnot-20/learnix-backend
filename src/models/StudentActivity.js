import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/**
 * Unified student activity log for analytics — exercises, homework, integrity,
 * vocabulary, tests, control works, etc.
 */
const studentActivitySchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("act") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    eventType: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: ["game", "homework", "control_work", "mock_test", "entry_test", "system"],
      default: "game",
    },
    subject: { type: String, index: true },
    contextId: { type: String, index: true },
    contextLabel: { type: String },
    materialSlug: { type: String, index: true },
    materialTitle: { type: String },
    correctCount: { type: Number },
    totalQuestions: { type: Number },
    score: { type: Number },
    accuracy: { type: Number },
    durationSeconds: { type: Number },
    timedOut: { type: Boolean, default: false },
    failedDueToCheating: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now, index: true },
  },
  { _id: false },
)

studentActivitySchema.index({ studentId: 1, at: -1 })
studentActivitySchema.index({ studentId: 1, category: 1, at: -1 })
studentActivitySchema.index({ studentId: 1, eventType: 1, at: -1 })

studentActivitySchema.methods.toJSON = function toJSON() {
  return {
    id: this._id,
    studentId: this.studentId,
    eventType: this.eventType,
    category: this.category,
    source: this.source,
    subject: this.subject ?? null,
    contextId: this.contextId ?? null,
    contextLabel: this.contextLabel ?? null,
    materialSlug: this.materialSlug ?? null,
    materialTitle: this.materialTitle ?? null,
    correctCount: this.correctCount ?? null,
    totalQuestions: this.totalQuestions ?? null,
    score: this.score ?? null,
    accuracy: this.accuracy ?? null,
    durationSeconds: this.durationSeconds ?? null,
    timedOut: this.timedOut ?? false,
    failedDueToCheating: this.failedDueToCheating ?? false,
    metadata: this.metadata ?? null,
    at: this.at,
  }
}

export const StudentActivity = mongoose.model("StudentActivity", studentActivitySchema)
