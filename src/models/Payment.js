import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const paymentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("pay") },
    orgId: { type: String, required: true, index: true },
    studentId: { type: String, ref: "User", required: true, index: true },
    groupId: { type: String, ref: "Group", required: true },
    amount: { type: Number, required: true, min: 0 },
    periodLabel: { type: String, required: true },
    dueDate: { type: Date, required: true },
    paidDate: { type: Date },
    status: { type: String, enum: ["pending", "paid", "overdue"], default: "pending" },
    notes: { type: String },
  },
  { _id: false },
)

export const Payment = mongoose.model("Payment", paymentSchema)
