import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const studentSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("std") },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    groupId: { type: String, ref: "Group" },
    joinedAt: { type: Date, default: Date.now },
    monthlyFee: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false },
)

export const Student = mongoose.model("Student", studentSchema)
