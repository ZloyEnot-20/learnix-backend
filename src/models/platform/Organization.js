import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const organizationSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    subdomain: { type: String, required: true },
    status: { type: String, default: "active" },
    plan: { type: String, default: "free" },
  },
  { timestamps: true, _id: false },
)

export function getOrganizationModel() {
  const conn = getPlatformConnection()
  return conn.models.Organization ?? conn.model("Organization", organizationSchema)
}
