import mongoose from "mongoose"
import { env } from "./env.js"
import { MONGO_DRIVER_OPTS, logMongoConnectError, logMongoConnectSuccess } from "./mongoOptions.js"
import { logMongoNetworkHint } from "./dbConnectHint.js"
import { ensureUserIndexes } from "./userIndexes.js"

mongoose.set("strictQuery", true)

export async function connectDB() {
  // Works for both mongodb:// and mongodb+srv:// connection strings.
  // dbName ensures we use a named database even if the URI omits the path.
  try {
    await mongoose.connect(env.mongoUri, {
      ...MONGO_DRIVER_OPTS,
      dbName: env.dbName,
    })
    logMongoConnectSuccess("main", mongoose.connection.name)
    await ensureUserIndexes()
    return mongoose.connection
  } catch (err) {
    await logMongoConnectError("main", err, logMongoNetworkHint)
    throw err
  }
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
