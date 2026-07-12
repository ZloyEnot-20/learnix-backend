/**
 * Backfill questionTypes on existing IeltsReading docs using the current classifier.
 *
 * Run with: node src/scripts/backfill-reading-question-types.mjs
 */
import { setServers } from "node:dns"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { IeltsReading } from "../models/IeltsReading.js"
import { collectReadingQuestionTypes } from "../services/ieltsReading.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  const docs = await IeltsReading.find({}).select("_id slug data questionTypes").lean()
  let updated = 0
  for (const doc of docs) {
    const questionTypes = collectReadingQuestionTypes(doc.data)
    await IeltsReading.updateOne({ _id: doc._id }, { $set: { questionTypes } })
    updated += 1
  }
  const sample = await IeltsReading.findOne({}).select("slug questionTypes").lean()
  console.log(`[reading] backfilled questionTypes on ${updated} test(s)`)
  console.log("[reading] sample:", sample?.slug, sample?.questionTypes)
} finally {
  await mongoose.disconnect().catch(() => {})
}
