import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const platformPaymentSchema = new Schema(
  {
    _id: { type: String, required: true },
    orgId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    status: { type: String, default: "pending" },
    periodLabel: { type: String, required: true },
    paidAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true, _id: false },
)

export function getPlatformPaymentModel() {
  const conn = getPlatformConnection()
  return conn.models.PlatformPayment ?? conn.model("PlatformPayment", platformPaymentSchema)
}
