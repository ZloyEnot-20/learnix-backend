import mongoose from "mongoose"

const topicStatSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true },
    title: { type: String, default: "" },
    attemptedQuestions: { type: Number, default: 0 },
    correctAnswers: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    firstAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    lastSuccessAt: { type: Date },
    accuracy: { type: Number, default: 0 },
    weightedAccuracy: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    learnixLevel: { type: Number, min: 1, max: 9 },
    mastered: { type: Boolean, default: false },
    needsReview: { type: Boolean, default: false },
  },
  { _id: false },
)

const skillDimensionsSchema = new mongoose.Schema(
  {
    grammar: { type: Number, default: 0 },
    vocabulary: { type: Number, default: 0 },
    fluency: { type: Number, default: 0 },
    pronunciation: { type: Number, default: 0 },
  },
  { _id: false },
)

const skillProfileSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 0, min: 0, max: 1000 },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    level: { type: Number, default: 1, min: 1, max: 9 },
    topics: { type: [topicStatSchema], default: [] },
    dimensions: skillDimensionsSchema,
    hasData: { type: Boolean, default: false },
  },
  { _id: false },
)

/**
 * Persisted language skill profile per student. Recomputed asynchronously
 * from submissions, practice events, and vocabulary progress.
 */
const studentLanguageProfileSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = studentId
    studentId: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, required: true, index: true },
    grammar: { type: skillProfileSchema, default: () => ({}) },
    vocabulary: { type: skillProfileSchema, default: () => ({}) },
    speaking: { type: skillProfileSchema, default: () => ({}) },
    /** Placeholders — populated when data sources exist. */
    reading: { type: skillProfileSchema, default: () => ({ hasData: false }) },
    listening: { type: skillProfileSchema, default: () => ({ hasData: false }) },
    writing: { type: skillProfileSchema, default: () => ({ hasData: false }) },
    overall: {
      score: { type: Number, default: 0, min: 0, max: 1000 },
      level: { type: Number, default: 1, min: 1, max: 9 },
      confidence: { type: Number, default: 0, min: 0, max: 1 },
    },
    coverage: {
      attemptedTopics: { type: Number, default: 0 },
      masteredTopics: { type: Number, default: 0 },
      totalTopics: { type: Number, default: 0 },
      needsReviewTopics: { type: Number, default: 0 },
    },
    masteredTopics: { type: [String], default: [] },
    needsReviewTopics: { type: [String], default: [] },
    /** Percent of catalogue topics mastered per Learnix level (1–9). */
    levelCoverage: {
      type: mongoose.Schema.Types.Mixed,
      default: () => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 0])),
    },
    /** Precomputed on recompute — not regenerated on page load. */
    recommendations: {
      type: [
        new mongoose.Schema(
          {
            type: { type: String, required: true },
            skill: { type: String },
            topic: { type: String },
            title: { type: String },
            priority: {
              type: String,
              enum: ["high", "medium", "low"],
              default: "medium",
            },
            reason: { type: String },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    lastComputedAt: { type: Date },
    version: { type: Number, default: 1 },
  },
  { _id: false, timestamps: true },
)

studentLanguageProfileSchema.index({ orgId: 1, "overall.level": -1 })

studentLanguageProfileSchema.methods.toJSON = function toJSON() {
  return {
    studentId: this.studentId,
    orgId: this.orgId,
    grammar: this.grammar,
    vocabulary: this.vocabulary,
    speaking: this.speaking,
    reading: { ...this.reading, hasData: false },
    listening: { ...this.listening, hasData: false },
    writing: { ...this.writing, hasData: false },
    overall: this.overall,
    coverage: this.coverage,
    masteredTopics: this.masteredTopics,
    needsReviewTopics: this.needsReviewTopics,
    levelCoverage: this.levelCoverage ?? {},
    recommendations: this.recommendations ?? [],
    lastComputedAt: this.lastComputedAt,
    version: this.version,
    updatedAt: this.updatedAt,
  }
}

export const StudentLanguageProfile = mongoose.model(
  "StudentLanguageProfile",
  studentLanguageProfileSchema,
)
