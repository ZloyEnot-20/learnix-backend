import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const ownerClaimSchema = new Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    orgId: { type: String, required: true, index: true },
    code: { type: String, required: true, index: true },
    password: { type: String, select: false, default: null },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    usedByChatId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

export function getOwnerClaimModel() {
  const conn = getPlatformConnection()
  return conn.models.OwnerClaim ?? conn.model("OwnerClaim", ownerClaimSchema)
}
