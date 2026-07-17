import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { Exercise } from "../models/Exercise.js"
import { setServers } from "node:dns"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
const sample = await Exercise.findOne({ slug: "there-is-there-are-test-1" }).lean()
console.log(
  JSON.stringify(
    {
      slug: sample?.slug,
      type: sample?.type,
      totalQuestions: sample?.totalQuestions,
      questionTypes: sample?.data?.questionTypes,
      qCount: sample?.data?.content?.questions?.length,
      qTypes: sample?.data?.content?.questions?.map((q) => q.type),
    },
    null,
    2,
  ),
)
const n10 = await Exercise.countDocuments({ topic: "there-is-there-are", totalQuestions: 10 })
const mixed = await Exercise.countDocuments({ type: "mixed" })
const splitLeft = await Exercise.countDocuments({
  slug: /-test-\d+-(fill-in-the-blank|multiple-choice|true-false|error-correction)$/,
})
console.log({ thereIs10q: n10, mixedTotal: mixed, splitLeft })
await mongoose.disconnect()
