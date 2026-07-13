/**
 * Seed only curriculum books (requires Mongo).
 * Usage: npm run seed:books
 */
import { setServers } from "node:dns"
import { connectDB, disconnectDB } from "../config/db.js"
import mongoose from "../config/mongoose.js"
import { seedCurriculumBooks } from "../seed/curriculum-books-seed.js"

// Windows/local DNS often refuses SRV lookups that mongodb+srv requires.
setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

async function main() {
  await connectDB()
  const result = await seedCurriculumBooks()
  console.log("[seed:books]", result)
}

main()
  .then(async () => {
    await disconnectDB()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error("[seed:books] failed:", err?.message || err)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
  })
