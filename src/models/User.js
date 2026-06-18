import mongoose from "mongoose"

import { uid } from "../utils/ids.js"

import { USER_TYPE_VALUES, USER_TYPES, STAFF_TYPES } from "../constants/userTypes.js"
import { normalizePermissions } from "../services/permissions.service.js"



/**

 * Single source of truth for all people in a tenant org.

 * Every user has a required `type` (student, teacher, admin, super_admin).

 * Other collections reference users via studentId (always a User _id).

 */

const userSchema = new mongoose.Schema(

  {

    _id: { type: String, default: () => uid("user") },

    orgId: { type: String, index: true, default: null },

    login: { type: String, lowercase: true, trim: true },

    email: { type: String, lowercase: true, trim: true },

    name: { type: String, required: true, trim: true },

    type: {

      type: String,

      enum: USER_TYPE_VALUES,

      required: true,

    },

    passwordHash: { type: String, required: true, select: false },

    isPremium: { type: Boolean, default: false },

    avatarUrl: { type: String, trim: true },

    phone: { type: String, trim: true },

    groupId: { type: String, ref: "Group" },

    joinedAt: { type: Date, default: Date.now },

    /** Set when the student is assigned to a group; cleared on removal. */
    groupJoinedAt: { type: Date },

    monthlyFee: { type: Number, min: 0 },

    notes: { type: String, trim: true },

    targetBand: { type: Number, min: 4, max: 9 },

    targetExamDate: { type: Date },

    /** Extra capabilities granted by super admin (teachers only). */
    permissions: {
      type: [String],
      default: [],
    },

  },

  { timestamps: true, _id: false },

)



userSchema.index({ orgId: 1, login: 1 }, { unique: true, sparse: true })

userSchema.index(

  { orgId: 1, email: 1 },

  {

    unique: true,

    partialFilterExpression: {

      email: { $exists: true, $type: "string", $gt: "" },

    },

  },

)

userSchema.index({ orgId: 1, groupId: 1, type: 1 })



userSchema.pre("validate", function stripEmptyEmail() {

  if (this.email === "" || this.email === null) {

    this.email = undefined

  }

})



userSchema.methods.toSafeJSON = function toSafeJSON() {

  return {

    id: this._id,

    orgId: this.orgId ?? null,

    login: this.login ?? this.email ?? "",

    email: this.email ?? "",

    name: this.name,

    type: this.type,

    isPremium: this.isPremium,

    avatarUrl: this.avatarUrl ?? null,

    phone: this.phone,

    groupId: this.groupId,

    joinedAt: this.joinedAt,

    groupJoinedAt: this.groupJoinedAt ?? null,

    monthlyFee: this.monthlyFee,

    notes: this.notes,

    targetBand: this.targetBand ?? null,

    targetExamDate: this.targetExamDate ?? null,

    permissions: STAFF_TYPES.includes(this.type)
      ? normalizePermissions(this.permissions)
      : [],

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

    groupJoinedAt: this.groupJoinedAt ?? null,

    monthlyFee: this.monthlyFee,

    notes: this.notes,

    targetBand: this.targetBand ?? null,

    targetExamDate: this.targetExamDate ?? null,

  }

}



export const User = mongoose.model("User", userSchema)

export { USER_TYPES }


