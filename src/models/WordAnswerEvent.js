import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** Immutable log of every vocabulary word answer. */
const wordAnswerEventSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("wae") },
    orgId: { type: String, index: true, default: null },
    studentId: { type: String, ref: "User", required: true, index: true },
    term: { type: String, required: true, index: true },
    deckSlug: { type: String, required: true, index: true },
    correct: { type: Boolean, required: true },
    source: {
      type: String,
      enum: ["quiz", "review", "flashcard", "homework"],
      required: true,
    },
    interactionType: { type: String, default: "multiple_choice" },
    at: { type: Date, default: Date.now, index: true },
  },
  { _id: false },
)

wordAnswerEventSchema.index({ studentId: 1, at: -1 })
wordAnswerEventSchema.index({ deckSlug: 1, term: 1, correct: 1 })

export const WordAnswerEvent = mongoose.model("WordAnswerEvent", wordAnswerEventSchema)
