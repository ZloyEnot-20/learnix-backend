import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("user") },
    orgId: { type: String, index: true, default: null },
    login: { type: String, lowercase: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["super_admin", "admin", "teacher", "student"],
      default: "student",
    },
    passwordHash: { type: String, required: true, select: false },
    isPremium: { type: Boolean, default: false },
    phone: { type: String, trim: true },
    groupId: { type: String, ref: "Group" },
    joinedAt: { type: Date, default: Date.now },
    monthlyFee: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { timestamps: true, _id: false },
)

userSchema.index({ orgId: 1, login: 1 }, { unique: true, sparse: true })
userSchema.index({ orgId: 1, email: 1 }, { unique: true, sparse: true })

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    orgId: this.orgId ?? null,
    login: this.login ?? this.email ?? "",
    email: this.email ?? "",
    name: this.name,
    role: this.role,
    isPremium: this.isPremium,
    phone: this.phone,
    groupId: this.groupId,
    joinedAt: this.joinedAt,
    monthlyFee: this.monthlyFee,
    notes: this.notes,
  }
}

/** Student list/detail shape for the admin panel. */
userSchema.methods.toStudentJSON = function toStudentJSON() {
  return {
    id: this._id,
    login: this.login ?? this.email ?? "",
    name: this.name,
    email: this.email ?? "",
    phone: this.phone,
    groupId: this.groupId,
    joinedAt: this.joinedAt,
    monthlyFee: this.monthlyFee,
    notes: this.notes,
  }
}

export const User = mongoose.model("User", userSchema)
