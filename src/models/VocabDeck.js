import mongoose from "mongoose"

/**
 * A vocabulary deck (flashcards + quiz). Stored so decks created in the admin
 * panel are visible to every user (students included), not just the author's
 * browser. `_id` is the deck slug so imports upsert idempotently.
 */
const vocabWordSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    term: { type: String, required: true },
    partOfSpeech: { type: String, default: "noun" },
    definition: { type: String, default: "" },
    example: { type: String, default: "" },
    translation: { type: String, default: "" },
    translationUz: { type: String, default: "" },
  },
  { _id: false },
)

const vocabDeckSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = slug
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    /** CEFR level — stage 1 content uses A1. */
    level: { type: String, default: "A1" },
    /** Theme label shown in the admin UI (e.g. Family, Travel). */
    topic: { type: String, default: "", trim: true },
    /** Word difficulty within the stage: easy | medium | hard. */
    difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
    /** null = global platform deck; set when created by an organization. */
    orgId: { type: String, index: true, default: null },
    words: { type: [vocabWordSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

vocabDeckSchema.index({ orgId: 1, slug: 1 })

export const VocabDeck = mongoose.model("VocabDeck", vocabDeckSchema)
