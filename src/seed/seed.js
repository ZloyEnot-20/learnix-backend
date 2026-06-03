/**
 * Seeds the database with demo accounts and the same mock CRM data the
 * frontend previously generated in localStorage. Idempotent-ish: it wipes the
 * relevant collections first, so re-running gives a clean known state.
 *
 * Run with: npm run seed
 */
import mongoose from "../config/mongoose.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { env } from "../config/env.js"
import { hashPassword } from "../utils/password.js"
import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { Student } from "../models/Student.js"
import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Payment } from "../models/Payment.js"

const DAY = 1000 * 60 * 60 * 24
const now = Date.now()
const iso = (ms) => new Date(ms)

async function seed() {
  await connectDB()

  console.log("[seed] clearing collections")
  await Promise.all([
    User.deleteMany({}),
    Group.deleteMany({}),
    Student.deleteMany({}),
    Homework.deleteMany({}),
    Submission.deleteMany({}),
    Payment.deleteMany({}),
  ])

  // ---- Auth accounts (Argon2id hashed) ----
  console.log("[seed] creating demo accounts")
  const [superHash, adminHash, teacherHash, studentHash] = await Promise.all([
    hashPassword(env.seed.superAdminPassword),
    hashPassword(env.seed.adminPassword),
    hashPassword(env.seed.teacherPassword),
    hashPassword(env.seed.studentPassword),
  ])

  await User.create([
    { _id: "superadmin-1", email: "superadmin@ielts.com", name: "Super Admin", role: "super_admin", passwordHash: superHash, isPremium: true },
    { _id: "admin-1", email: "admin@ielts.com", name: "Admin User", role: "admin", passwordHash: adminHash, isPremium: true },
    { _id: "teacher-1", email: "teacher@ielts.com", name: "Sarah Teacher", role: "teacher", passwordHash: teacherHash, isPremium: true },
    { _id: "student-1", email: "student@ielts.com", name: "Alex Student", role: "student", passwordHash: studentHash, studentId: "student-1" },
  ])

  // ---- Students ----
  // No mock students or groups. Only the demo student's own profile is created
  // so the "student@ielts.com" login has a record. Real students arrive via
  // self-registration; groups are created by staff in the admin panel.
  await Student.create([
    { _id: "student-1", name: "Alex Student", email: "student@ielts.com", joinedAt: iso(now - DAY * 20) },
  ])

  console.log("[seed] done:")
  console.log(`  users: ${await User.countDocuments()}`)
  console.log(`  groups: ${await Group.countDocuments()}`)
  console.log(`  students: ${await Student.countDocuments()}`)
  console.log(`  homework: ${await Homework.countDocuments()}`)
  console.log(`  submissions: ${await Submission.countDocuments()}`)
  console.log(`  payments: ${await Payment.countDocuments()}`)
  console.log("\n  Demo logins:")
  console.log("   superadmin@ielts.com / (SEED_SUPERADMIN_PASSWORD)")
  console.log("   admin@ielts.com   / (SEED_ADMIN_PASSWORD)")
  console.log("   teacher@ielts.com / (SEED_TEACHER_PASSWORD)")
  console.log("   student@ielts.com / (SEED_STUDENT_PASSWORD)")
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
