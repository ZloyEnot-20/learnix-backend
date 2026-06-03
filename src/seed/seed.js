/**
 * Seeds the database with demo accounts and the same mock CRM data the
 * frontend previously generated in localStorage. Idempotent-ish: it wipes the
 * relevant collections first, so re-running gives a clean known state.
 *
 * Run with: npm run seed
 */
import mongoose from "mongoose"
import { connectDB, disconnectDB } from "../config/db.js"
import { env } from "../config/env.js"
import { hashPassword } from "../utils/password.js"
import { uid } from "../utils/ids.js"
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
  const [adminHash, teacherHash, studentHash] = await Promise.all([
    hashPassword(env.seed.adminPassword),
    hashPassword(env.seed.teacherPassword),
    hashPassword(env.seed.studentPassword),
  ])

  await User.create([
    { _id: "admin-1", email: "admin@ielts.com", name: "Admin User", role: "admin", passwordHash: adminHash, isPremium: true },
    { _id: "teacher-1", email: "teacher@ielts.com", name: "Sarah Teacher", role: "teacher", passwordHash: teacherHash, isPremium: true },
    { _id: "student-1", email: "student@ielts.com", name: "Alex Student", role: "student", passwordHash: studentHash, studentId: "student-1" },
  ])

  // ---- Groups ----
  const groupA = {
    _id: "grp_alpha",
    name: "IELTS 7.0 — Morning",
    description: "Intermediate group targeting Band 7.0",
    teacherId: "teacher-1",
    studentIds: ["student-1", "std_anna", "std_ivan", "std_lena"],
    monthlyFee: 1_200_000,
    createdAt: iso(now - DAY * 60),
  }
  const groupB = {
    _id: "grp_beta",
    name: "IELTS 6.5 — Evening",
    description: "Pre-intermediate evening group",
    teacherId: "teacher-1",
    studentIds: ["std_mark", "std_polina"],
    monthlyFee: 900_000,
    createdAt: iso(now - DAY * 30),
  }
  await Group.create([groupA, groupB])

  // ---- Students ----
  const students = [
    { _id: "student-1", name: "Alex Student", email: "student@ielts.com", groupId: "grp_alpha", joinedAt: iso(now - DAY * 20), monthlyFee: 1_200_000 },
    { _id: "std_anna", name: "Anna Petrova", email: "anna@example.com", phone: "+7 999 111-22-33", groupId: "grp_alpha", joinedAt: iso(now - DAY * 58), monthlyFee: 1_200_000 },
    { _id: "std_ivan", name: "Ivan Volkov", email: "ivan@example.com", phone: "+7 999 222-33-44", groupId: "grp_alpha", joinedAt: iso(now - DAY * 52), monthlyFee: 1_200_000 },
    { _id: "std_lena", name: "Lena Sokolova", email: "lena@example.com", groupId: "grp_alpha", joinedAt: iso(now - DAY * 40), monthlyFee: 1_200_000 },
    { _id: "std_mark", name: "Mark Chen", email: "mark@example.com", groupId: "grp_beta", joinedAt: iso(now - DAY * 25), monthlyFee: 900_000 },
    { _id: "std_polina", name: "Polina Orlova", email: "polina@example.com", groupId: "grp_beta", joinedAt: iso(now - DAY * 12), monthlyFee: 900_000 },
  ]
  await Student.create(students)

  // ---- Homework ----
  const homework = [
    { _id: "hw_r1", title: "Cambridge 17 — Reading Passage 3", description: "Read the passage and answer questions 27–40 about global trade.", subject: "reading", groupId: "grp_alpha", dueAt: iso(now + DAY * 2), estimatedMinutes: 40, createdBy: "Admin", createdAt: iso(now - DAY) },
    { _id: "hw_w1", title: "Task 2 essay: Technology in education", description: "Write a 250-word essay arguing for or against tech in classrooms.", subject: "writing", groupId: "grp_alpha", dueAt: iso(now + DAY), estimatedMinutes: 40, createdBy: "Teacher", createdAt: iso(now - DAY * 2) },
    { _id: "hw_l1", title: "Listening Section 4 practice", description: "Complete the academic lecture exercise and submit answers.", subject: "listening", groupId: "grp_beta", dueAt: iso(now - DAY), estimatedMinutes: 30, createdBy: "Teacher", createdAt: iso(now - DAY * 6) },
    { _id: "hw_g1", title: "Verb To Be — Am, Is, Are (Intermediate)", description: "Practise the verb 'to be' with proper nouns and compound subjects.", subject: "grammar", groupId: "grp_alpha", dueAt: iso(now + DAY * 3), estimatedMinutes: 12, createdBy: "Teacher", exerciseSlug: "verb-to-be-positive-intermediate", createdAt: iso(now - DAY * 1.5) },
    { _id: "hw_g2", title: "There Is / There Are Statements", description: "Statements with countable and uncountable nouns.", subject: "grammar", groupId: "grp_beta", dueAt: iso(now + DAY * 4), estimatedMinutes: 10, createdBy: "Admin", exerciseSlug: "there-is-there-are-statements", createdAt: iso(now - DAY * 0.5) },
    { _id: "hw_s1", title: "Speaking Part 2 — Describe a memorable journey", description: "Record a 2-minute response. Cover when, where, who and why memorable.", subject: "speaking", groupId: "grp_alpha", dueAt: iso(now + DAY * 5), estimatedMinutes: 15, createdBy: "Teacher", createdAt: iso(now - DAY * 0.8) },
  ]
  await Homework.create(homework)

  // ---- Submissions (subset of the original mock for realism) ----
  const band = (correct, total) => Math.round((correct / total) * 9 * 2) / 2
  const submissions = [
    { homeworkId: "hw_r1", studentId: "std_anna", status: "submitted", score: 8, submittedAt: iso(now - DAY * 0.2), attempt: { totalQuestions: 14, correctCount: 12, durationSeconds: 38 * 60, mistakes: [] } },
    { homeworkId: "hw_r1", studentId: "std_ivan", status: "in_progress" },
    { homeworkId: "hw_r1", studentId: "std_lena", status: "pending" },
    { homeworkId: "hw_r1", studentId: "student-1", status: "pending" },
    { homeworkId: "hw_w1", studentId: "std_anna", status: "graded", score: 7, submittedAt: iso(now - DAY), feedback: "Strong arguments, work on conjunctions.", attempt: { totalQuestions: 8, correctCount: 6, durationSeconds: 52 * 60, mistakes: [] } },
    { homeworkId: "hw_w1", studentId: "std_ivan", status: "submitted", submittedAt: iso(now - DAY * 0.5), attempt: { totalQuestions: 8, correctCount: 5, durationSeconds: 41 * 60, mistakes: [] } },
    { homeworkId: "hw_g1", studentId: "std_anna", status: "graded", score: 8.5, submittedAt: iso(now - DAY * 0.3), feedback: "Great pace, minor slips on plural subjects.", attempt: { totalQuestions: 12, correctCount: 11, durationSeconds: 9 * 60, mistakes: [{ questionId: 7, prompt: "Tom and Jerry _____ best friends.", userAnswer: "is", correctAnswer: "are", explanation: "Compound subjects with 'and' take a plural verb." }] } },
    { homeworkId: "hw_g1", studentId: "student-1", status: "pending" },
    { homeworkId: "hw_l1", studentId: "std_mark", status: "graded", score: 7.5, attempt: { totalQuestions: 10, correctCount: 9, durationSeconds: 24 * 60, mistakes: [] } },
    { homeworkId: "hw_l1", studentId: "std_polina", status: "submitted", submittedAt: iso(now - DAY * 0.6), attempt: { totalQuestions: 10, correctCount: 6, durationSeconds: 27 * 60, mistakes: [] } },
    { homeworkId: "hw_g2", studentId: "std_mark", status: "submitted", submittedAt: iso(now - DAY * 0.1), attempt: { totalQuestions: 10, correctCount: 9, durationSeconds: 7 * 60, mistakes: [] } },
    { homeworkId: "hw_g2", studentId: "std_polina", status: "graded", score: 7, feedback: "Solid grasp, careful with uncountables.", submittedAt: iso(now - DAY * 0.4), attempt: { totalQuestions: 10, correctCount: 8, durationSeconds: 8 * 60, mistakes: [] } },
    { homeworkId: "hw_s1", studentId: "std_anna", status: "pending" },
    { homeworkId: "hw_s1", studentId: "std_ivan", status: "pending" },
  ]
  await Submission.insertMany(submissions.map((s) => ({ _id: uid("sub"), ...s })))

  // ---- Payments ----
  const months = ["April 2026", "May 2026", "June 2026"]
  const payments = []
  for (const s of students) {
    months.forEach((label, idx) => {
      const dueOffsetDays = (months.length - 1 - idx) * 30
      const dueDate = iso(now - DAY * dueOffsetDays + DAY * 5)
      const isPast = dueDate.getTime() < now
      const paid = idx < months.length - 1
      const status = paid ? "paid" : isPast ? "overdue" : "pending"
      payments.push({
        _id: uid("pay"),
        studentId: s._id,
        groupId: s.groupId,
        amount: s.monthlyFee ?? 900_000,
        periodLabel: label,
        dueDate,
        paidDate: paid ? iso(dueDate.getTime() - DAY * 2) : undefined,
        status,
      })
    })
  }
  await Payment.insertMany(payments)

  console.log("[seed] done:")
  console.log(`  users: ${await User.countDocuments()}`)
  console.log(`  groups: ${await Group.countDocuments()}`)
  console.log(`  students: ${await Student.countDocuments()}`)
  console.log(`  homework: ${await Homework.countDocuments()}`)
  console.log(`  submissions: ${await Submission.countDocuments()}`)
  console.log(`  payments: ${await Payment.countDocuments()}`)
  console.log("\n  Demo logins:")
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
