import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const issueReportSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("ir") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, required: true },
    homeworkId: { type: String, index: true, default: null },
    controlWorkId: { type: String, index: true, default: null },
    stepIndex: { type: Number, default: null },
    exerciseSlug: { type: String, required: true, index: true },
    exerciseTitle: { type: String, required: true },
    exerciseKind: {
      type: String,
      enum: ["grammar", "vocabulary", "podcast", "speaking", "listening"],
      required: true,
    },
    questionIndex: { type: Number, default: null },
    questionId: { type: Number, default: null },
    questionPrompt: { type: String, default: null },
    message: { type: String, maxlength: 50, default: null },
    status: {
      type: String,
      enum: ["open", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: String, default: null },
    resolvedByName: { type: String, default: null },
  },
  { timestamps: true, _id: false },
)

issueReportSchema.index({ createdAt: -1 })
issueReportSchema.index({ orgId: 1, status: 1, createdAt: -1 })

issueReportSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id,
    studentId: this.studentId,
    studentName: this.studentName,
    homeworkId: this.homeworkId ?? null,
    controlWorkId: this.controlWorkId ?? null,
    stepIndex: this.stepIndex ?? null,
    exerciseSlug: this.exerciseSlug,
    exerciseTitle: this.exerciseTitle,
    exerciseKind: this.exerciseKind,
    questionIndex: this.questionIndex ?? null,
    questionId: this.questionId ?? null,
    questionPrompt: this.questionPrompt ?? null,
    message: this.message ?? null,
    status: this.status,
    resolvedAt: this.resolvedAt ?? null,
    resolvedById: this.resolvedById ?? null,
    resolvedByName: this.resolvedByName ?? null,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
}

export const IssueReport = mongoose.model("IssueReport", issueReportSchema)
