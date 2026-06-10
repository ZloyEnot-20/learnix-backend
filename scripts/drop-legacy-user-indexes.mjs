/**
 * One-time fix: drop global users.login / users.email unique indexes left over
 * from before multi-tenant orgId scoping.
 *
 * Usage: node scripts/drop-legacy-user-indexes.mjs
 */
import "../src/config/mongoose.js"
import { connectDB, disconnectDB } from "../src/config/db.js"

await connectDB()
await disconnectDB()
console.log("User indexes upgraded (legacy indexes removed, email partial index applied).")
