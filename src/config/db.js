import mongoose from "mongoose"
import { env } from "./env.js"
import {
  buildMongoConnectOptions,
  logMongoConnectDebug,
  logMongoConnectError,
  logMongoConnectSuccess,
} from "./mongoOptions.js"
import { logMongoNetworkHint } from "./dbConnectHint.js"
import { ensureUserIndexes } from "./userIndexes.js"

mongoose.set("strictQuery", true)

export async function connectDB() {
  // Works for both mongodb:// and mongodb+srv:// connection strings.
  // dbName ensures we use a named database even if the URI omits the path.
  try {
    // Windows/local resolvers often refuse SRV; prefer public DNS for mongodb+srv.
    if (String(env.mongoUri || "").startsWith("mongodb+srv")) {
      const { setServers } = await import("node:dns")
      setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])
    }
    logMongoConnectDebug("main", {
      mongoUri: env.mongoUri,
      dbName: env.dbName,
      platformDbName: env.platformDbName,
    })
    await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
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
