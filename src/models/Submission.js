import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const mistakeSchema = new mongoose.Schema(
  {
    questionId: Number,
    prompt: String,
    userAnswer: String,
    correctAnswer: String,
    explanation: String,
    /** Teacher overall score for a speaking recording (0–9 legacy scale). */
    score: Number,
    /** Teacher rubric scores (0–10 each). */
    grammarScore: Number,
    vocabularyScore: Number,
    fluencyScore: Number,
    pronunciationScore: Number,
    /** Teacher feedback for a single speaking recording. */
    feedback: String,
    /** Auto-generated speech-to-text (Whisper) — may be inaccurate. */
    transcription: String,
  },
  { _id: false },
)

const attemptItemSchema = new mongoose.Schema(
  {
    questionId: Number,
    prompt: String,
    isCorrect: Boolean,
  },
  { _id: false },
)

const listeningSeekSchema = new mongoose.Schema(
  {
    fromSeconds: Number,
    toSeconds: Number,
    atMs: Number,
  },
  { _id: false },
)

const listenedSegmentSchema = new mongoose.Schema(
  {
    startSeconds: Number,
    endSeconds: Number,
  },
  { _id: false },
)

const listeningStatsSchema = new mongoose.Schema(
  {
    totalListenSeconds: { type: Number, default: 0 },
    seekCount: { type: Number, default: 0 },
    rewindCount: { type: Number, default: 0 },
    forwardCount: { type: Number, default: 0 },
    seeks: { type: [listeningSeekSchema], default: [] },
    listenedSegments: { type: [listenedSegmentSchema], default: [] },
    podcastDurationSeconds: { type: Number, default: 0 },
    completedListening: { type: Boolean, default: false },
    wordsReviewed: { type: Number, default: 0 },
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
    /** Podcast listening telemetry — seeks, cumulative play time, word review. */
    listeningStats: listeningStatsSchema,
    /** Per-question answers for IELTS reading homework review. */
    readingAnswers: {
      type: [
        new mongoose.Schema(
          {
            questionId: Number,
            userAnswer: String,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    /** full = entire exercise; mistakes_only = remediating prior wrong items. */
    mode: { type: String, enum: ["full", "mistakes_only"], default: "full" },
    /** Whether this attempt met the homework mastery threshold. */
    passed: { type: Boolean, default: false },
    /** History-safe per-question outcome (no answers). */
    items: { type: [attemptItemSchema], default: [] },
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
        "retry",
        "mastery_attempt",
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
    /** Denormalized from Homework for reports (exercise slug or subject). */
    topic: { type: String, index: true },
    /** Grammar topic slug (e.g. present-simple) — denormalized from Exercise. */
    grammarTopic: { type: String, index: true },
    /** Vocabulary deck slug — denormalized from VocabDeck. */
    vocabularyTopic: { type: String, index: true },
    /** Learnix topic level 1–9 for grammar content. */
    grammarLevel: { type: Number, min: 1, max: 9 },
    /** Learnix topic level 1–9 for vocabulary deck. */
    vocabularyLevel: { type: Number, min: 1, max: 9 },
    /** Denormalized homework subject for Homework check / analytics without joins. */
    subject: {
      type: String,
      enum: ["reading", "listening", "writing", "speaking", "grammar", "vocabulary"],
      index: true,
    },
    homeworkTitle: { type: String },
    /** Denormalized mastery flag from Homework at assign / first submit time. */
    masteryMode: { type: Boolean, default: false },
    assignedAt: { type: Date, default: Date.now },
    /** Last time the student opened this homework (mobile entry counter). */
    lastEntryAt: { type: Date },
    /** Session / integrity timeline — single source for homework audit trail. */
    events: { type: [submissionEventSchema], default: [] },
    /** How many times the student opened/resumed this homework session. */
    entryCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "in_progress", "paused", "needs_retry", "submitted", "graded"],
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
    /** Latest attempt (completed or in-progress draft). */
    attempt: { type: attemptSchema },
    /** Completed attempt history (mastery mode). Legacy docs may omit this. */
    attempts: { type: [attemptSchema], default: undefined },
  },
  { _id: false },
)

submissionSchema.index({ homeworkId: 1, studentId: 1 }, { unique: true })

export const Submission = mongoose.model("Submission", submissionSchema)
