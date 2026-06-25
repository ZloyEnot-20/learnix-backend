/**
 * Backfill gamification fields on all student users from activity collections.
 *
 * Usage:
 *   node scripts/migrate-user-gamification.js
 *
 * Requires MONGODB_URI and MONGODB_DB in env or .env.
 */
import { setServers } from "node:dns"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { recomputeStudentGamificationBatch } from "../src/services/gamification.service.js"

// Windows/ISP DNS sometimes refuses SRV lookups that Node needs for mongodb+srv.
setServers(["8.8.8.8", "1.1.1.1"])

const BATCH_SIZE = 100

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const users = mongoose.connection.collection("users")
  const cursor = users.find({ type: "student" }, { projection: { _id: 1 } })

  let processed = 0
  let batch = []

  for await (const doc of cursor) {
    batch.push(doc._id)
    if (batch.length >= BATCH_SIZE) {
      await recomputeStudentGamificationBatch(batch)
      processed += batch.length
      console.log(`Migrated ${processed} students…`)
      batch = []
    }
  }

  if (batch.length > 0) {
    await recomputeStudentGamificationBatch(batch)
    processed += batch.length
  }

  console.log(`Done. Migrated gamification for ${processed} students.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
