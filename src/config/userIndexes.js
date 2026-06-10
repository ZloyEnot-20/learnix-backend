import { User } from "../models/User.js"

const LEGACY_INDEXES = ["login_1", "email_1"]
const EMAIL_INDEX = "orgId_1_email_1"

/**
 * Remove pre-tenant global unique indexes on users.login / users.email.
 * The schema now uses sparse compound keys { orgId, login } and { orgId, email }.
 * Leaving the legacy indexes breaks student creation without email (dup key: { email: null }).
 */
export async function dropLegacyUserIndexes() {
  const collection = User.collection
  for (const name of LEGACY_INDEXES) {
    try {
      await collection.dropIndex(name)
      console.log(`[db] dropped legacy users index ${name}`)
    } catch {
      /* already removed */
    }
  }
}

/** Recreate org email uniqueness with a partial filter so many students can omit email. */
export async function ensureUserIndexes() {
  await dropLegacyUserIndexes()

  const collection = User.collection
  const indexes = await collection.indexes()
  const emailIndex = indexes.find((idx) => idx.name === EMAIL_INDEX)
  const hasPartialFilter = Boolean(emailIndex?.partialFilterExpression?.email)

  if (!hasPartialFilter) {
    try {
      await collection.dropIndex(EMAIL_INDEX)
      console.log(`[db] dropped ${EMAIL_INDEX} for partial-filter upgrade`)
    } catch {
      /* first deploy */
    }
  }

  await User.syncIndexes()
}