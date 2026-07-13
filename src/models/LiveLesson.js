import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const studentPresenceSchema = new mongoose.Schema(
  {
    studentId: { type: String, ref: "User", required: true },
    name: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["offline", "online", "working", "done"],
      default: "offline",
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    score: { type: Number, default: null },
    /** { correct, total, items[] } when auto-graded */
    scoreDetail: { type: mongoose.Schema.Types.Mixed, default: undefined },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },
    answers: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
)

/** Durable per-exercise submissions (survives exercise switches / resets). */
const exerciseResultSchema = new mongoose.Schema(
  {
    unitNumber: { type: Number, required: true },
    exerciseId: { type: String, required: true },
    studentId: { type: String, required: true },
    name: { type: String, default: "" },
    score: { type: Number, default: null },
    scoreDetail: { type: mongoose.Schema.Types.Mixed, default: undefined },
    answers: { type: mongoose.Schema.Types.Mixed, default: undefined },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const liveLessonSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("live") },
    orgId: { type: String, required: true, index: true },
    groupId: { type: String, ref: "Group", required: true, index: true },
    bookId: { type: String, required: true },
    teacherId: { type: String, ref: "User", required: true },
    code: { type: String, required: true, uppercase: true, unique: true, index: true },
    currentUnit: { type: Number, default: null },
    currentExercise: { type: String, default: null },
    /** When true, teacher may assign a different unit. Cleared on assign. */
    unitCompleted: { type: Boolean, default: false },
    lessonStatus: {
      type: String,
      enum: ["idle", "active", "paused", "finished"],
      default: "idle",
    },
    openForStudents: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    students: { type: [studentPresenceSchema], default: [] },
    exerciseResults: { type: [exerciseResultSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

liveLessonSchema.pre("save", function (next) {
  this.updatedAt = new Date()
  next()
})

liveLessonSchema.index({ groupId: 1, lessonStatus: 1 })
liveLessonSchema.index({ orgId: 1, groupId: 1 })

export const LiveLesson = mongoose.model("LiveLesson", liveLessonSchema)
