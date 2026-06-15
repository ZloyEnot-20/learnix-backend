import mongoose from "mongoose"
import { env } from "./env.js"
import { MONGO_DRIVER_OPTS } from "./mongoOptions.js"
import { ensureUserIndexes } from "./userIndexes.js"

mongoose.set("strictQuery", true)

export async function connectDB() {
  // Works for both mongodb:// and mongodb+srv:// connection strings.
  // dbName ensures we use a named database even if the URI omits the path.
  await mongoose.connect(env.mongoUri, {
    ...MONGO_DRIVER_OPTS,
    dbName: env.dbName,
  })
  // Avoid logging the full URI (it may contain credentials).
  console.log(`[db] connected to MongoDB (db: ${mongoose.connection.name})`)
  await ensureUserIndexes()
  return mongoose.connection
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
