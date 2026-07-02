import admin from "firebase-admin"
import { env } from "./env.js"

let initialized = false

function parseServiceAccount() {
  const rawJson = env.firebase.serviceAccountJson
  if (rawJson) {
    try {
      return JSON.parse(rawJson)
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON")
    }
  }

  const { projectId, clientEmail, privateKey } = env.firebase
  if (!projectId || !clientEmail || !privateKey) return null

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey.replace(/\\n/g, "\n"),
  }
}

export function isFirebaseEnabled() {
  return initialized
}

export function initializeFirebase() {
  if (initialized) {
    console.log("[firebase] already initialized, reusing messaging client")
    return admin.messaging()
  }

  let serviceAccount
  try {
    serviceAccount = parseServiceAccount()
  } catch (err) {
    console.error("[firebase] failed to parse service account:", err.message)
    return null
  }

  if (!serviceAccount) {
    console.warn("[firebase] no service account — env fields incomplete after parse")
    return null
  }

  const missing = []
  if (!serviceAccount.project_id) missing.push("project_id")
  if (!serviceAccount.client_email) missing.push("client_email")
  if (!serviceAccount.private_key) missing.push("private_key")
  if (missing.length) {
    console.warn(`[firebase] service account missing fields: ${missing.join(", ")}`)
    return null
  }

  console.log(
    `[firebase] parsed credentials — project_id=${serviceAccount.project_id}, client_email=${serviceAccount.client_email}`,
  )

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key,
        }),
      })
      console.log("[firebase] admin.initializeApp succeeded")
    }
  } catch (err) {
    console.error("[firebase] admin.initializeApp failed:", err.message)
    if (err.stack) console.error(err.stack)
    return null
  }

  initialized = true
  return admin.messaging()
}

export function getMessaging() {
  return initializeFirebase()
}
