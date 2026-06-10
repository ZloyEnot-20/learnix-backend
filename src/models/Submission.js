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
    failedDueToCheating: Boolean,
    cheatingReason: String,
  },
  { _id: false },
)

const submissionEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: [
        "assigned",
        "entry",
        "start",
        "pause",
        "violation",
        "cheating",
        "submit",
        "graded",
      ],
      required: true,
    },
    reason: { type: String },
    entryCount: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
)

/**
 * One document per student × homework assignment.
 * All homework progress, results, integrity, and session stats live here.
 */
const submissionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("sub") },
    orgId: { type: String, required: true, index: true },
    homeworkId: { type: String, ref: "Homework", required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    /** Denormalized from Homework for reports (topic slug or subject). */
    topic: { type: String, index: true },
    /** Denormalized homework subject for Homework check / analytics without joins. */
    subject: {
      type: String,
      enum: ["reading", "listening", "writing", "speaking", "grammar", "vocabulary"],
      index: true,
    },
    homeworkTitle: { type: String },
    assignedAt: { type: Date, default: Date.now },
    /** Last time the student opened this homework (mobile entry counter). */
    lastEntryAt: { type: Date },
    /** Session / integrity timeline — single source for homework audit trail. */
    events: { type: [submissionEventSchema], default: [] },
    /** How many times the student opened/resumed this homework session. */
    entryCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "in_progress", "paused", "submitted", "graded"],
      default: "pending",
    },
    integrityStatus: {
      type: String,
      enum: ["ok", "cheating_suspicion", "cheating_detected"],
      default: "ok",
    },
    violationCount: { type: Number, default: 0 },
    score: { type: Number },
    startedAt: { type: Date },
    /** Wall-clock when the current active segment began; null while paused. */
    sessionStartedAt: { type: Date },
    /** Accumulated active seconds (timer frozen while paused). */
    elapsedSeconds: { type: Number, default: 0 },
    /** Student used their one-time pause / graceful exit. */
    pauseUsed: { type: Boolean, default: false },
    pausedAt: { type: Date },
    submittedAt: { type: Date },
    feedback: { type: String },
    attempt: { type: attemptSchema },
  },
  { _id: false },
)

submissionSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true })

export const Submission = mongoose.model("Submission", submissionSchema)
