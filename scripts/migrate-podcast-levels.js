/**
 * Rebalance podcast CEFR levels: move the upper half of A1 → A2 and B1 → B2
 * (sorted by order, then title).
 *
 * Usage:
 *   node scripts/migrate-podcast-levels.js
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"

async function moveHalf(collection, fromLevel, toLevel) {
  const docs = await collection
    .find({ level: fromLevel })
    .sort({ order: 1, title: 1 })
    .project({ _id: 1, slug: 1, title: 1 })
    .toArray()

  const moveCount = Math.ceil(docs.length / 2)
  const toMove = docs.slice(moveCount)
  if (toMove.length === 0) {
    console.log(`[skip] ${fromLevel}: nothing to move (${docs.length} total)`)
    return 0
  }

  const slugs = toMove.map((d) => d.slug ?? d._id)
  const result = await collection.updateMany(
    { slug: { $in: slugs } },
    { $set: { level: toLevel } },
  )

  console.log(
    `[done] ${fromLevel} → ${toLevel}: moved ${result.modifiedCount}/${toMove.length} (kept ${docs.length - toMove.length} in ${fromLevel})`,
  )
  for (const d of toMove) {
    console.log(`  · ${d.title} (${d.slug ?? d._id})`)
  }
  return result.modifiedCount
}

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const collection = mongoose.connection.collection("podcasts")
  const total = await collection.countDocuments()
  console.log(`[info] ${total} podcast(s) in database`)

  await moveHalf(collection, "A1", "A2")
  await moveHalf(collection, "B1", "B2")

  const after = await collection.aggregate([{ $group: { _id: "$level", count: { $sum: 1 } } }]).toArray()
  console.log("[summary]", Object.fromEntries(after.map((r) => [r._id, r.count])))

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
