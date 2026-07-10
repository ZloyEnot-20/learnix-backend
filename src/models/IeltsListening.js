import mongoose from "mongoose"

/**
 * IELTS Listening practice test. Full client payload lives in `data`
 * (mirrors `IeltsListeningTest`). `_id` is the slug for idempotent imports.
 */
const ieltsListeningSchema = new mongoose.Schema(
  {
    _id: { type: String },
    slug: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    book: { type: Number, min: 1 },
    test: { type: Number, min: 1 },
    totalTimeMinutes: { type: Number, default: 30, min: 0 },
    questionCount: { type: Number, default: 40, min: 0 },
    fullAudioUrl: { type: String, default: "" },
    /** Full `IeltsListeningTest` payload returned verbatim to the client. */
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false, timestamps: true },
)

export const IeltsListening = mongoose.model("IeltsListening", ieltsListeningSchema)
