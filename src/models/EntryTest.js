import mongoose from "mongoose"

import { uid } from "../utils/ids.js"



const entryTestSchema = new mongoose.Schema(

  {

    _id: { type: String, default: () => uid("entry") },

    orgId: { type: String, required: true, index: true },

    /** Always references a User with type `student` — profile data lives on User. */

    studentId: { type: String, ref: "User", required: true, index: true },

    /** `student` = login access; `phone` = public phone-verified access. */

    source: {

      type: String,

      enum: ["student", "phone"],

      default: "student",

      index: true,

    },

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



entryTestSchema.index({ orgId: 1, studentId: 1, source: 1 })



export const EntryTest = mongoose.model("EntryTest", entryTestSchema)


