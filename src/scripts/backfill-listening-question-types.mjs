import { setServers } from "node:dns"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { IeltsListening } from "../models/IeltsListening.js"
import { collectListeningQuestionTypes } from "../services/ieltsListening.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  const docs = await IeltsListening.find().select("_id data").lean()
  let updated = 0
  for (const doc of docs) {
    const questionTypes = collectListeningQuestionTypes(doc.data)
    await IeltsListening.updateOne({ _id: doc._id }, { $set: { questionTypes } })
    updated += 1
  }
  const sample = await IeltsListening.findOne().lean()
  console.log(`[listening] backfilled questionTypes on ${updated} test(s)`)
  console.log("[listening] sample:", sample?.slug, sample?.questionTypes)
} finally {
  await mongoose.disconnect()
}
