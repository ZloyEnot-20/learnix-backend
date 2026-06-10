import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

/**
 * Group metadata. Membership is stored on User.groupId — not duplicated here.
 * API responses include a computed `studentIds` array for convenience.
 */
const groupSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("grp") },
    orgId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    teacherId: { type: String, ref: "User" },
    monthlyFee: { type: Number, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export const Group = mongoose.model("Group", groupSchema)
