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
import { CAMBRIDGE_UNIT_VOCAB_DECKS } from "../content/cambridge-unit-vocab-decks.js"
import { seedCurriculumBooks } from "./curriculum-books-seed.js"

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

/** Upsert starter + Cambridge unit vocabulary decks so the DB owns all deck data. */
async function seedVocabDecks() {
  const allDecks = [...VOCAB_DECKS, ...CAMBRIDGE_UNIT_VOCAB_DECKS]
  for (const deck of allDecks) {
    await VocabDeck.updateOne(
      { _id: deck.slug },
      { $set: { ...deck, orgId: null } },
      { upsert: true },
    )
  }
  console.log(
    `[seed] ensured ${allDecks.length} vocabulary decks (${VOCAB_DECKS.length} starter + ${CAMBRIDGE_UNIT_VOCAB_DECKS.length} Cambridge units)`,
  )
}

async function seed() {
  assertSeedPassword("SEED_SUPERADMIN_PASSWORD", env.seed.superAdminPassword)
  await connectDB()
  await seedSuperAdmin()
  await clearExtraLevels()
  await seedVocabDecks()
  await seedCurriculumBooks()
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
