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
import { hashPassword } from "../utils/password.js"
import { User } from "../models/User.js"
import { Student } from "../models/Student.js"
import { Level } from "../models/Level.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { VOCAB_DECKS } from "../content/vocab-decks.js"

async function seedSuperAdmin() {
  const email = env.seed.superAdminEmail
  if (await User.findOne({ email })) {
    console.log(`[seed] super admin already exists: ${email}`)
    return
  }
  await User.create({
    email,
    name: "Super Admin",
    role: "super_admin",
    passwordHash: await hashPassword(env.seed.superAdminPassword),
    isPremium: true,
  })
  console.log(`[seed] created super admin: ${email}`)
}

async function seedStudent() {
  const email = env.seed.studentEmail
  if (await User.findOne({ email })) {
    console.log(`[seed] student already exists: ${email}`)
    return
  }
  const student = await Student.create({ name: "Student", email })
  await User.create({
    email,
    name: "Student",
    role: "student",
    passwordHash: await hashPassword(env.seed.studentPassword),
    studentId: student._id,
  })
  console.log(`[seed] created student: ${email}`)
}

/** Extra (non-CEFR) level folders shown alongside A1–C2. Idempotent upsert. */
async function seedLevels() {
  const levels = [
    { _id: "Advanced", key: "Advanced", label: "Advanced", color: "rose", comingSoon: true, cefr: "C1", order: 100 },
    { _id: "Expert", key: "Expert", label: "Expert", color: "purple", comingSoon: true, cefr: "C2", order: 101 },
  ]
  for (const lvl of levels) {
    await Level.updateOne({ _id: lvl._id }, { $set: lvl }, { upsert: true })
  }
  console.log(`[seed] ensured ${levels.length} extra level folder(s)`)
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
  await connectDB()
  await seedSuperAdmin()
  await seedStudent()
  await seedLevels()
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
