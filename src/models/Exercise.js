import mongoose from "mongoose"

/**
 * A single practice exercise (grammar / vocabulary). The full client-facing
 * shape lives in `data` (mirrors the frontend `GrammarExercise` type) so the
 * catalogue is lossless; the top-level columns are denormalised copies kept
 * only for filtering/sorting and stable identity.
 *
 * `_id` is the exercise slug — slugs are unique and URL-safe, which makes
 * imports idempotent (re-importing upserts by slug instead of duplicating).
 */
const exerciseSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = slug
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["grammar", "vocabulary"],
      default: "grammar",
      index: true,
    },
    topic: { type: String, required: true, index: true },
    subtopic: { type: String, default: "" },
    type: { type: String, required: true, index: true },
    level: { type: String, default: "" },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
    },
    estimatedTime: { type: Number, default: 0, min: 0 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    /** Full `GrammarExercise` payload returned verbatim to the client. */
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { _id: false, timestamps: true },
)

export const Exercise = mongoose.model("Exercise", exerciseSchema)
