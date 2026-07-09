/**
 * Backfill StudentWordProgress.consecutiveCorrect for existing rows.
 *
 * We cannot reconstruct exact streak history without events, so we:
 * - set consecutiveCorrect = 0 when missing
 * - if masteredAt is set, set consecutiveCorrect = MASTERY_CORRECT_THRESHOLD (assume met)
 *
 * Usage:
 *   node scripts/migrate-student-word-progress-streak.js
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { StudentWordProgress } from "../src/models/StudentWordProgress.js"
import { MASTERY_CORRECT_THRESHOLD } from "../src/config/level-thresholds.js"
import { setServers } from "node:dns"

setServers(["8.8.8.8", "1.1.1.1"])

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const filter = {
    $or: [{ consecutiveCorrect: { $exists: false } }, { consecutiveCorrect: null }],
  }

  const before = await StudentWordProgress.countDocuments(filter)
  console.log(`StudentWordProgress missing consecutiveCorrect: ${before}`)

  if (before > 0) {
    const res = await StudentWordProgress.updateMany(
      filter,
      {
        $set: { consecutiveCorrect: 0 },
      },
    )
    console.log(`Initialized consecutiveCorrect=0 on ${res.modifiedCount ?? 0} rows`)
  }

  const masteredFilter = {
    masteredAt: { $ne: null },
    $or: [{ consecutiveCorrect: { $lt: MASTERY_CORRECT_THRESHOLD } }, { consecutiveCorrect: null }],
  }
  const masteredBefore = await StudentWordProgress.countDocuments(masteredFilter)
  if (masteredBefore > 0) {
    const res2 = await StudentWordProgress.updateMany(masteredFilter, {
      $set: { consecutiveCorrect: MASTERY_CORRECT_THRESHOLD },
    })
    console.log(`Set streak=${MASTERY_CORRECT_THRESHOLD} for ${res2.modifiedCount ?? 0} mastered rows`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

