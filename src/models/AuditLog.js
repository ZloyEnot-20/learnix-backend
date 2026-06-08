import mongoose from "mongoose"
import { uid } from "../utils/ids.js"

const auditLogSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => uid("audit") },
    action: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    actorId: { type: String, index: true },
    actorName: { type: String, required: true },
    actorRole: { type: String },
    targetType: { type: String },
    targetId: { type: String, index: true },
    targetLabel: { type: String },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: false },
)

auditLogSchema.index({ createdAt: -1 })

auditLogSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id,
    action: this.action,
    category: this.category,
    actorId: this.actorId ?? null,
    actorName: this.actorName,
    actorRole: this.actorRole ?? null,
    targetType: this.targetType ?? null,
    targetId: this.targetId ?? null,
    targetLabel: this.targetLabel ?? null,
    details: this.details ?? null,
    ipAddress: this.ipAddress ?? null,
    userAgent: this.userAgent ?? null,
    createdAt: this.createdAt,
  }
}

export const AuditLog = mongoose.model("AuditLog", auditLogSchema)
