import mongoose from "mongoose"
import { env } from "./env.js"
import {
  buildMongoConnectOptions,
  logMongoConnectDebug,
  logMongoConnectError,
  logMongoConnectSuccess,
} from "./mongoOptions.js"
import { logMongoNetworkHint } from "./dbConnectHint.js"

let platformConn = null

/** Secondary connection for platform admin data (org owner claims). */
export async function connectPlatformDB() {
  if (platformConn) return platformConn
  try {
    logMongoConnectDebug("platform", {
      mongoUri: env.mongoUri,
      dbName: env.platformDbName,
    })
    platformConn = mongoose.createConnection(
      env.mongoUri,
      buildMongoConnectOptions(env.platformDbName),
    )
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
