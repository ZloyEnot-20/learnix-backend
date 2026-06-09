import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const testResultSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("res") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    testType: {
      type: String,
      enum: ["reading", "listening", "writing", "speaking"],
      required: true,
    },
    date: { type: Date, default: Date.now },
    bandScore: { type: Number },
    totalCorrect: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    answers: { type: Map, of: String, default: {} },
    parts: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { _id: false },
)

export const TestResult = mongoose.model("TestResult", testResultSchema)
