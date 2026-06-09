import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const entryTestSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("entry") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String },
    assignedBy: { type: String, default: "System" },
    assignedAt: { type: Date, default: Date.now },

    // Multiple-choice grammar (answers keyed by question id → option string)
    mcAnswers: { type: Map, of: String, default: {} },
    mcCompleted: { type: Boolean, default: false },
    mcScore: { type: Number },
    mcLevel: { type: String },

    // Reading (answers keyed by question id → option index OR boolean)
    readingAnswers: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    readingCompleted: { type: Boolean, default: false },
    readingScore: { type: Number },
    readingLevel: { type: String },

    // Writing (teacher-graded)
    writingText: { type: String, default: "" },
    writingSubmitted: { type: Boolean, default: false },
    writingWordCount: { type: Number },
    writingLevel: { type: String },
    writingFeedback: { type: String },

    // Final placement set by the teacher
    overallLevel: { type: String },

    status: {
      type: String,
      enum: ["assigned", "in_progress", "awaiting_review", "graded"],
      default: "assigned",
    },
  },
  { timestamps: true, _id: false },
)

export const EntryTest = mongoose.model("EntryTest", entryTestSchema)
