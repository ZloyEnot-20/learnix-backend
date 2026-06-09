import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const controlWorkStepSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      enum: ["vocabulary", "grammar", "reading", "listening", "writing"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    exerciseSlug: { type: String },
    deckSlug: { type: String },
    testId: { type: String },
    topic: { type: String },
  },
  { _id: false },
)

const controlWorkSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("cw") },
    orgId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    groupId: { type: String, ref: "Group", required: true },
    dueAt: { type: Date, required: true },
    timeLimitMinutes: { type: Number, min: 0 },
    createdBy: { type: String, default: "System" },
    /** Resolved ordered steps students complete sequentially. */
    steps: { type: [controlWorkStepSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const ControlWork = mongoose.model("ControlWork", controlWorkSchema)
