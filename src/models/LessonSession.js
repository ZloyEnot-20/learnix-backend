import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: { type: String, ref: "User", required: true },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
    },
    notes: { type: String, trim: true },
  },
  { _id: false },
)

const lessonSessionSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("lsn") },
    orgId: { type: String, required: true, index: true },
    groupId: { type: String, ref: "Group", required: true, index: true },
    /** Calendar date stored at UTC midnight (YYYY-MM-DD from client). */
    date: { type: Date, required: true },
    topic: { type: String, trim: true },
    notes: { type: String, trim: true },
    /** Auto-created from group lessonWeekdays schedule. */
    fromSchedule: { type: Boolean, default: false },
    canceled: { type: Boolean, default: false },
    cancelReason: { type: String, trim: true },
    /** Set when teacher saves attendance for this lesson. */
    attendanceMarked: { type: Boolean, default: false },
    attendance: { type: [attendanceRecordSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

lessonSessionSchema.index({ groupId: 1, date: 1 }, { unique: true })

export const LessonSession = mongoose.model("LessonSession", lessonSessionSchema)
