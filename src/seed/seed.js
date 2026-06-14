/**
 * Bootstraps the database with a single super-admin account so staff can log in
 * and create real data from the admin panel. No mock users, students, groups or
 * homework are created — those arrive via self-registration and the admin panel.
 *
 * The super-admin email/password come from env (SEED_SUPERADMIN_EMAIL /
 * SEED_SUPERADMIN_PASSWORD). Existing data is left untouched.
 *
 * Run with: npm run seed
 */
import mongoose from "../config/mongoose.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { env } from "../config/env.js"
import { assertSeedPassword } from "../utils/seedGuard.js"
import { hashPassword } from "../utils/password.js"
import { User } from "../models/User.js"
import { Level } from "../models/Level.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { VOCAB_DECKS } from "../content/vocab-decks.js"

async function seedSuperAdmin() {
  const email = env.seed.superAdminEmail
  if (await User.findOne({ $or: [{ email }, { login: email }] })) {
    console.log(`[seed] super admin already exists: ${email}`)
    return
  }
  await User.create({
    login: email,
    email,
    name: "Super Admin",
    type: "super_admin",
    passwordHash: await hashPassword(env.seed.superAdminPassword),
    isPremium: true,
  })
  console.log(`[seed] created super admin: ${email}`)
}

/**
 * Levels are now hard-coded on the frontend (Beginner → Expert). Drop any
 * leftover dynamic level folders so they no longer surface as duplicates.
 */
async function clearExtraLevels() {
  const { deletedCount } = await Level.deleteMany({})
  if (deletedCount) console.log(`[seed] removed ${deletedCount} legacy extra level folder(s)`)
}

/** Upsert the starter vocabulary decks so the DB owns all deck data. */
async function seedVocabDecks() {
  for (const deck of VOCAB_DECKS) {
    await VocabDeck.updateOne(
      { _id: deck.slug },
      { $set: { ...deck } },
      { upsert: true },
    )
  }
  console.log(`[seed] ensured ${VOCAB_DECKS.length} vocabulary decks`)
}

async function seed() {
  assertSeedPassword("SEED_SUPERADMIN_PASSWORD", env.seed.superAdminPassword)
  await connectDB()
  await seedSuperAdmin()
  await clearExtraLevels()
  await seedVocabDecks()
}

seed()
  .then(async () => {
    await disconnectDB()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error("[seed] failed:", err?.message)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
  })
