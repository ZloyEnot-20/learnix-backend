import mongoose from "mongoose"

/**
 * An extra (non-CEFR) level folder shown alongside A1–C2 on the Exercises page,
 * e.g. "Advanced" / "Expert". `_id` is the level key so seeds/imports upsert
 * idempotently. `color` is a folder-colour preset id; `comingSoon` shows a badge
 * and disables the folder.
 */
const levelSchema = new mongoose.Schema(
  {
    _id: { type: String }, // = key
    key: { type: String, required: true, trim: true },
    label: { type: String, default: "" },
    color: { type: String, default: "" },
    comingSoon: { type: Boolean, default: false },
    /** CEFR band shown as the card's top-right badge (e.g. "C1"). */
    cefr: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const Level = mongoose.model("Level", levelSchema)
