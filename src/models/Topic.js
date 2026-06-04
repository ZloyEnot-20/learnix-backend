import mongoose from "mongoose"

/**
 * An exercise folder/topic. Stores the catalogue metadata (planned counts,
 * level coverage, description) used to render the topic cards. `_id` is the
 * topic slug so imports upsert idempotently.
 */
const topicSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = slug
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    levels: { type: String, default: "" },
    exerciseCount: { type: Number, default: 0, min: 0 },
    questionCount: { type: Number, default: 0, min: 0 },
    totalMinutes: { type: Number, default: 0, min: 0 },
    /** Preset colour id used to tint the folder's CEFR level on the catalogue. */
    color: { type: String, default: "" },
    /** Display order — lower comes first. */
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const Topic = mongoose.model("Topic", topicSchema)
