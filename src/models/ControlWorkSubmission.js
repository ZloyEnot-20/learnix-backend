import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const stepResultSchema = new mongoose.Schema(
  {
    stepIndex: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    attempt: {
      totalQuestions: { type: Number, default: 0 },
      correctCount: { type: Number, default: 0 },
      durationSeconds: { type: Number },
      mistakes: { type: Array, default: [] },
      timedOut: { type: Boolean },
      answeredCount: { type: Number },
    },
    submittedAt: { type: Date },
  },
  { _id: false },
)

const controlWorkSubmissionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("cws") },
    orgId: { type: String, required: true, index: true },
    controlWorkId: { type: String, ref: "ControlWork", required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "paused", "submitted", "graded"],
      default: "pending",
    },
    currentStep: { type: Number, default: 0 },
    stepResults: { type: [stepResultSchema], default: [] },
    integrityStatus: {
      type: String,
      enum: ["ok", "cheating_suspicion", "cheating_detected"],
      default: "ok",
    },
    violationCount: { type: Number, default: 0 },
    score: { type: Number },
    startedAt: { type: Date },
    sessionStartedAt: { type: Date },
    elapsedSeconds: { type: Number, default: 0 },
    pauseUsed: { type: Boolean, default: false },
    pausedAt: { type: Date },
    submittedAt: { type: Date },
    feedback: { type: String, trim: true },
  },
  { _id: false },
)

controlWorkSubmissionSchema.index({ controlWorkId: 1, studentId: 1 }, { unique: true })

export const ControlWorkSubmission = mongoose.model(
  "ControlWorkSubmission",
  controlWorkSubmissionSchema,
)
