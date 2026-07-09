import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** Point-in-time snapshot of student language profile scores for progress tracking. */
const snapshotSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("lps") },
    studentId: { type: String, required: true, index: true },
    orgId: { type: String, required: true, index: true },
    grammarScore: { type: Number, default: 0 },
    vocabularyScore: { type: Number, default: 0 },
    speakingScore: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0 },
    grammarLevel: { type: Number, min: 1, max: 9 },
    vocabularyLevel: { type: Number, min: 1, max: 9 },
    speakingLevel: { type: Number, min: 1, max: 9 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { _id: false },
)

snapshotSchema.index({ studentId: 1, createdAt: -1 })

export const StudentLanguageProfileSnapshot = mongoose.model(
  "StudentLanguageProfileSnapshot",
  snapshotSchema,
)
