import mongoose from "mongoose"

/**
 * Per-student topic mastery record.
 * Recomputed on language profile refresh from exercise/submission data.
 */
const studentTopicMasterySchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    orgId: { type: String, required: true, index: true },
    topicId: { type: String, required: true },
    category: {
      type: String,
      enum: ["grammar", "vocabulary", "academic_vocabulary"],
      required: true,
    },
    cefrLevel: { type: String, enum: ["A1", "A2", "B1", "B2", "C1", "C2"], required: true },
    /** 0–100 composite mastery score. */
    masteryScore: { type: Number, default: 0, min: 0, max: 100 },
    /** 0–1 data reliability. */
    confidenceScore: { type: Number, default: 0, min: 0, max: 1 },
    attempts: { type: Number, default: 0 },
    attemptedQuestions: { type: Number, default: 0 },
    weightedAccuracy: { type: Number, default: 0 },
    /** mastered | partial | not_mastered */
    masteryStatus: {
      type: String,
      enum: ["mastered", "partial", "not_mastered"],
      default: "not_mastered",
    },
    lastPracticedAt: { type: Date },
    lastComputedAt: { type: Date },
  },
  { timestamps: true },
)

studentTopicMasterySchema.index({ studentId: 1, topicId: 1 }, { unique: true })
studentTopicMasterySchema.index({ orgId: 1, studentId: 1, category: 1 })
studentTopicMasterySchema.index({ studentId: 1, cefrLevel: 1 })
studentTopicMasterySchema.index({ studentId: 1, masteryScore: -1 })

studentTopicMasterySchema.methods.toJSON = function toJSON() {
  return {
    studentId: this.studentId,
    topicId: this.topicId,
    category: this.category,
    cefrLevel: this.cefrLevel,
    masteryScore: this.masteryScore,
    confidenceScore: this.confidenceScore,
    attempts: this.attempts,
    attemptedQuestions: this.attemptedQuestions,
    weightedAccuracy: this.weightedAccuracy,
    masteryStatus: this.masteryStatus,
    lastPracticedAt: this.lastPracticedAt,
    lastComputedAt: this.lastComputedAt,
    updatedAt: this.updatedAt,
  }
}

export const StudentTopicMastery = mongoose.model(
  "StudentTopicMastery",
  studentTopicMasterySchema,
)
