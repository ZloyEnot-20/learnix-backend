import mongoose from "mongoose"
import { env } from "./env.js"

mongoose.set("strictQuery", true)

export async function connectDB() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
  })
  // Avoid logging the full URI (it may contain credentials).
  console.log("[db] connected to MongoDB")
  return mongoose.connection
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
