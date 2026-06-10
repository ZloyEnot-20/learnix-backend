/**
 * One-time migration: link legacy entry tests to users and drop duplicated profile fields.
 *
 * For each entry test missing studentId, tries to match by phone (users collection)
 * or by studentName + orgId. Then unsets studentName, studentEmail, phone on entrytests.
 *
 * Usage:
 *   node scripts/migrate-entry-test-user-refs.js
 *
 * Requires MONGODB_URI and MONGODB_DB in env or .env.
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  const entryTests = mongoose.connection.collection("entrytests")
  const users = mongoose.connection.collection("users")

  const cursor = entryTests.find({
    $or: [{ studentId: { $exists: false } }, { studentId: null }, { studentId: "" }],
  })

  let linked = 0
  let skipped = 0
  let cleaned = 0

  for await (const doc of cursor) {
    let studentId = doc.studentId

    if (!studentId && doc.phone) {
      const user = await users.findOne({
        type: "student",
        phone: doc.phone,
        ...(doc.orgId ? { orgId: doc.orgId } : {}),
      })
      if (user) studentId = user._id
    }

    if (!studentId && doc.studentName && doc.orgId) {
      const user = await users.findOne({
        type: "student",
        orgId: doc.orgId,
        name: doc.studentName,
      })
      if (user) studentId = user._id
    }

    if (studentId) {
      await entryTests.updateOne({ _id: doc._id }, { $set: { studentId } })
      linked++
    } else {
      console.warn(`[skip] entry test ${doc._id} — could not resolve studentId`)
      skipped++
    }
  }

  const unsetResult = await entryTests.updateMany(
    {},
    { $unset: { studentName: "", studentEmail: "", phone: "" } },
  )
  cleaned = unsetResult.modifiedCount

  console.log(`[done] linked=${linked} skipped=${skipped} cleaned=${cleaned}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
