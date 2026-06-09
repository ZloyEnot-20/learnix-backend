import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("ntf") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["homework", "result", "reminder", "achievement", "system", "entry_test"],
      default: "system",
    },
    title: { type: String, required: true },
    message: { type: String, default: "" },
    // Tuzilgan qo'shimcha ma'lumot (bot ota-onaga tushunarli matn tuzishi uchun):
    // { homeworkTitle, subject, dueAt, status, correctCount, totalQuestions, score }.
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Telegramga yetkazilgan chat id lar — bir xabar bir chatga bir marta yuboriladi
    // (dublikatlarni oldini olish: darhol yuborish + zaxira reconcile uchun).
    deliveredChatIds: { type: [String], default: [] },
    read: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
)

notificationSchema.index({ studentId: 1, createdAt: -1 })

export const Notification = mongoose.model("Notification", notificationSchema)
