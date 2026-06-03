import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("user") },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["super_admin", "admin", "teacher", "student"],
      default: "student",
    },
    passwordHash: { type: String, required: true, select: false },
    isPremium: { type: Boolean, default: false },
    /** Links an auth account to its Student CRM record (for role=student). */
    studentId: { type: String, ref: "Student" },
  },
  { timestamps: true, _id: false },
)

// Never leak the password hash when serialising a user.
userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    role: this.role,
    isPremium: this.isPremium,
    studentId: this.studentId,
  }
}

export const User = mongoose.model("User", userSchema)
