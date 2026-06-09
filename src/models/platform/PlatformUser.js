import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const platformUserSchema = new Schema(
  {
    _id: { type: String, required: true },
    email: { type: String, required: true },
    login: { type: String, default: null },
    name: { type: String, required: true },
    role: { type: String, required: true },
    orgId: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, _id: false },
)

export function getPlatformUserModel() {
  const conn = getPlatformConnection()
  return conn.models.PlatformUser ?? conn.model("PlatformUser", platformUserSchema)
}
