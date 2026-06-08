import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const mistakeSchema = new mongoose.Schema(
  {
    questionId: Number,
    prompt: String,
    userAnswer: String,
    correctAnswer: String,
    explanation: String,
  },
  { _id: false },
)

const attemptSchema = new mongoose.Schema(
  {
    totalQuestions: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    durationSeconds: Number,
    mistakes: { type: [mistakeSchema], default: [] },
    timedOut: Boolean,
    answeredCount: Number,
  },
  { _id: false },
)

const submissionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("sub") },
    homeworkId: { type: String, ref: "Homework", required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "submitted", "graded"],
      default: "pending",
    },
    score: { type: Number },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    feedback: { type: String },
    attempt: { type: attemptSchema },
  },
  { _id: false },
)

submissionSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true })

export const Submission = mongoose.model("Submission", submissionSchema)
