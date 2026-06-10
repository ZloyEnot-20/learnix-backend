/**
 * One-time migration: rename users.role → users.type.
 *
 * Usage:
 *   node scripts/migrate-user-role-to-type.js
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { USER_TYPE_VALUES } from "../src/constants/userTypes.js"

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const users = mongoose.connection.collection("users")

  const withRole = await users.countDocuments({ role: { $exists: true } })
  if (withRole > 0) {
    const result = await users.updateMany(
      { role: { $exists: true }, type: { $exists: false } },
      [{ $set: { type: "$role" } }],
    )
    await users.updateMany({}, { $unset: { role: "" } })
    console.log(`[done] migrated=${result.modifiedCount}`)
  } else {
    console.log("[done] no legacy role field found")
  }

  const invalid = await users
    .find({ type: { $nin: USER_TYPE_VALUES } })
    .project({ _id: 1, type: 1 })
    .toArray()
  if (invalid.length) {
    console.warn(`[warn] ${invalid.length} user(s) with invalid or missing type:`)
    for (const u of invalid) console.warn(`  ${u._id}: ${u.type ?? "(missing)"}`)
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
