import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const groupSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("grp") },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    teacherId: { type: String, ref: "User" },
    studentIds: { type: [String], default: [] },
    monthlyFee: { type: Number, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const Group = mongoose.model("Group", groupSchema)
