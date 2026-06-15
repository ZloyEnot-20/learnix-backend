import mongoose from "mongoose"
import { env } from "./env.js"
import { MONGO_DRIVER_OPTS, logMongoConnectError, logMongoConnectSuccess } from "./mongoOptions.js"
import { logMongoNetworkHint } from "./dbConnectHint.js"

let platformConn = null

/** Secondary connection for platform admin data (org owner claims). */
export async function connectPlatformDB() {
  if (platformConn) return platformConn
  try {
    platformConn = mongoose.createConnection(env.mongoUri, {
      ...MONGO_DRIVER_OPTS,
      dbName: env.platformDbName,
    })
    await platformConn.asPromise()
    logMongoConnectSuccess("platform", platformConn.name)
    return platformConn
  } catch (err) {
    platformConn = null
    await logMongoConnectError("platform", err, logMongoNetworkHint)
    throw err
  }
}

export function getPlatformConnection() {
  if (!platformConn) {
    throw new Error("Platform DB not connected — call connectPlatformDB() first")
  }
  return platformConn
}

export async function disconnectPlatformDB() {
  if (!platformConn) return
  await platformConn.close()
  platformConn = null
}
