import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/** A single finished grammar-exercise attempt, used for analytics. */
const exerciseEventSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("evt") },
    topic: { type: String, required: true, index: true },
    subtopic: { type: String },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    timedOut: { type: Boolean, default: false },
    studentId: { type: String, ref: "Student", index: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const ExerciseEvent = mongoose.model("ExerciseEvent", exerciseEventSchema)
