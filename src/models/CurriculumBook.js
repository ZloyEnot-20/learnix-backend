import mongoose from "mongoose"

/**
 * Platform curriculum book (shared across all tenants).
 * `orgId: null` = global — same pattern as Exercise / VocabDeck.
 * Full book JSON lives in `data` (book meta, units, answer_key, tests…).
 */
const curriculumBookSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = slug / bookId
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, trim: true, default: "" },
    isbn: { type: String, trim: true, default: "" },
    publisher: { type: String, trim: true, default: "" },
    year: { type: Number, default: null },
    /** Full book document: { book, units, answer_key?, tests? } */
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    unitCount: { type: Number, default: 0, min: 0 },
    readyUnitCount: { type: Number, default: 0, min: 0 },
    /** null = platform book available to every org. */
    orgId: { type: String, index: true, default: null },
    published: { type: Boolean, default: true, index: true },
  },
  { _id: false, timestamps: true },
)

curriculumBookSchema.index({ orgId: 1, slug: 1 })

export const CurriculumBook = mongoose.model("CurriculumBook", curriculumBookSchema)
