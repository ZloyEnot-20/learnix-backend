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
    level: { type: String, default: "A1" },
    words: { type: [vocabWordSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const VocabDeck = mongoose.model("VocabDeck", vocabDeckSchema)
