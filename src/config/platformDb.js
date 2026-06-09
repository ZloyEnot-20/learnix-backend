import mongoose from "mongoose"
import { env } from "./env.js"

let platformConn = null

/** Secondary connection for platform admin data (org owner claims). */
export async function connectPlatformDB() {
  if (platformConn) return platformConn
  platformConn = mongoose.createConnection(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.platformDbName,
  })
  await platformConn.asPromise()
  console.log(`[db] connected to platform MongoDB (db: ${platformConn.name})`)
  return platformConn
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
