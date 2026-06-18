import mongoose from "mongoose"

/**
 * A level-scoped podcast episode for listening homework.
 * Optional `words` — vocabulary shown after listening (`word` + `definition` only).
 * `_id` is the slug so imports upsert idempotently.
 */
const podcastWordSchema = new mongoose.Schema(
  {
    word: { type: String, required: true },
    definition: { type: String, default: "" },
  },
  { _id: false },
)

const podcastSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = slug
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    /** Thematic topic, e.g. "Travel", "Daily routine". */
    topic: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    level: { type: String, default: "A1", index: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "easy",
      index: true,
    },
    audioUrl: { type: String, required: true },
    durationMinutes: { type: Number, default: 0, min: 0 },
    words: { type: [podcastWordSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const Podcast = mongoose.model("Podcast", podcastSchema)
