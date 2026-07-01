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
  if (initialized) return admin.messaging()

  const serviceAccount = parseServiceAccount()
  if (!serviceAccount?.project_id || !serviceAccount?.client_email || !serviceAccount?.private_key) {
    return null
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
      }),
    })
  }

  initialized = true
  return admin.messaging()
}

export function getMessaging() {
  return initializeFirebase()
}
