import mongoose from "mongoose"

/**
 * IELTS Reading practice test. Full client payload lives in `data`
 * (mirrors `IeltsReadingTest`). `_id` is the slug for idempotent imports.
 */
const ieltsReadingSchema = new mongoose.Schema(
  {
    _id: { type: String },
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    totalTimeMinutes: { type: Number, default: 20, min: 0 },
    questionCount: { type: Number, default: 0, min: 0 },
    questionTypes: { type: [String], default: [] },
    /** CEFR band (A1–B1). Empty string = IELTS catalogue. */
    level: { type: String, default: "", index: true },
    /** Full `IeltsReadingTest` payload returned verbatim to the client. */
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const IeltsReading = mongoose.model("IeltsReading", ieltsReadingSchema)
