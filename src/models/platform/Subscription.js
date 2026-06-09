import { Schema } from "mongoose"
import { getPlatformConnection } from "../../config/platformDb.js"

const subscriptionSchema = new Schema(
  {
    _id: { type: String, required: true },
    orgId: { type: String, required: true, index: true },
    plan: { type: String, default: "free" },
    status: { type: String, default: "trialing" },
    trialEndsAt: { type: Date },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    canceledAt: { type: Date },
  },
  { timestamps: true, _id: false },
)

export function getSubscriptionModel() {
  const conn = getPlatformConnection()
  return conn.models.Subscription ?? conn.model("Subscription", subscriptionSchema)
}
