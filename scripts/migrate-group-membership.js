/**
 * One-time migration: move group membership from Group.studentIds to User.groupId.
 *
 * User.groupId is the source of truth. Legacy studentIds arrays on groups are
 * used only to backfill missing User.groupId values, then removed.
 *
 * Usage:
 *   node scripts/migrate-group-membership.js
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const groups = mongoose.connection.collection("groups")
  const users = mongoose.connection.collection("users")

  let backfilled = 0
  let skipped = 0

  for await (const group of groups.find({})) {
    const legacyIds = group.studentIds ?? []
    for (const studentId of legacyIds) {
      const user = await users.findOne({ _id: studentId, type: "student" })
      if (!user) {
        skipped++
        continue
      }
      if (user.groupId && user.groupId !== group._id) {
        skipped++
        continue
      }
      if (!user.groupId) {
        await users.updateOne({ _id: studentId }, { $set: { groupId: group._id } })
        backfilled++
      }
    }
  }

  const unsetResult = await groups.updateMany({}, { $unset: { studentIds: "" } })

  console.log(
    `[done] backfilled=${backfilled} skipped=${skipped} groupsCleaned=${unsetResult.modifiedCount}`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
