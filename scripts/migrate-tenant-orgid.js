/**
 * One-time migration: assign orgId to existing tenant data.
 *
 * Usage:
 *   DEFAULT_ORG_ID=org_xxx node scripts/migrate-tenant-orgid.js
 *
 * Requires MONGODB_URI and MONGODB_DB (default: ielts) in env or .env.
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.js"

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID
if (!DEFAULT_ORG_ID) {
  console.error("Set DEFAULT_ORG_ID to the platform organization _id.")
  process.exit(1)
}

const TENANT_COLLECTIONS = [
  "users",
  "groups",
  "submissions",
  "controlworks",
  "controlworksubmissions",
  "payments",
  "entrytests",
  "notifications",
  "studentactivities",
  "exerciseevents",
  "testresults",
  "parentlinks",
  "studentclaims",
  "botinvites",
  "auditlogs",
]

async function backfillCollection(db, name) {
  const result = await db.collection(name).updateMany(
    { $or: [{ orgId: null }, { orgId: { $exists: false } }] },
    { $set: { orgId: DEFAULT_ORG_ID } },
  )
  console.log(`[${name}] matched=${result.matchedCount} modified=${result.modifiedCount}`)
}

async function dropLegacyUserIndexes(db) {
  const users = db.collection("users")
  for (const name of ["login_1", "email_1"]) {
    try {
      await users.dropIndex(name)
      console.log(`[users] dropped legacy index ${name}`)
    } catch {
      /* index may not exist */
    }
  }
}

/** Backfill homework.orgId from the group's orgId. */
async function backfillHomeworkOrgId(db) {
  const homeworks = db.collection("homeworks")
  const groups = db.collection("groups")
  const rows = await homeworks
    .find({ $or: [{ orgId: null }, { orgId: { $exists: false } }] })
    .project({ _id: 1, groupId: 1 })
    .toArray()

  let modified = 0
  for (const hw of rows) {
    const group = hw.groupId ? await groups.findOne({ _id: hw.groupId }, { projection: { orgId: 1 } }) : null
    const orgId = group?.orgId ?? DEFAULT_ORG_ID
    await homeworks.updateOne({ _id: hw._id }, { $set: { orgId } })
    modified++
  }
  console.log(`[homeworks] backfilled orgId for ${modified} documents`)
}

async function main() {
  await mongoose.connect(env.mongoUri, { dbName: env.dbName })
  const db = mongoose.connection.db
  console.log(`Connected to ${env.dbName}, default orgId=${DEFAULT_ORG_ID}`)

  for (const name of TENANT_COLLECTIONS) {
    await backfillCollection(db, name)
  }

  await backfillHomeworkOrgId(db)
  await dropLegacyUserIndexes(db)
  console.log("Migration complete.")
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
