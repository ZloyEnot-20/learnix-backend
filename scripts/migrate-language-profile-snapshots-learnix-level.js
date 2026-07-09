/**
 * Backfill StudentLanguageProfileSnapshot.learnixLevel for old snapshots.
 *
 * Usage:
 *   node scripts/migrate-language-profile-snapshots-learnix-level.js
 *
 * Strategy:
 * - If learnixLevel is missing/null, set it to max(grammarLevel, vocabularyLevel, speakingLevel, 1)
 *   as a safe proxy for historical overall level (we don't have topic coverage in snapshot).
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { StudentLanguageProfileSnapshot } from "../src/models/StudentLanguageProfileSnapshot.js"
import { setServers } from "node:dns"

setServers(["8.8.8.8", "1.1.1.1"])

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const filter = {
    $or: [{ learnixLevel: { $exists: false } }, { learnixLevel: null }],
  }

  const before = await StudentLanguageProfileSnapshot.countDocuments(filter)
  console.log(`Snapshots missing learnixLevel: ${before}`)
  if (before > 0) {
    // Pipeline update requires MongoDB 4.2+. We assume modern Mongo for this project.
    const res = await StudentLanguageProfileSnapshot.updateMany(filter, [
      {
        $set: {
          learnixLevel: {
            $max: [
              { $ifNull: ["$grammarLevel", 1] },
              { $ifNull: ["$vocabularyLevel", 1] },
              { $ifNull: ["$speakingLevel", 1] },
              1,
            ],
          },
        },
      },
    ])
    console.log(`Backfilled learnixLevel on ${res.modifiedCount ?? 0} snapshots`)
  }

  const after = await StudentLanguageProfileSnapshot.countDocuments(filter)
  console.log(`Remaining without learnixLevel: ${after}`)

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

