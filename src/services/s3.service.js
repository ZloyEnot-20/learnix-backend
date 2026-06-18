import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { env, isProd } from "../config/env.js"
import { uid } from "../utils/ids.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_UPLOAD_ROOT = path.join(__dirname, "../../uploads")

let client = null

function getClient() {
  if (!env.s3.enabled) return null
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      endpoint: env.s3.endpoint,
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey,
      },
      forcePathStyle: true,
      // Timeweb and other S3-compatible providers reject default SDK checksums.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  }
  return client
}

/** Public URL for an object key in the configured bucket. */
export function publicObjectUrl(key) {
  const base = env.s3.endpoint.replace(/\/$/, "")
  return `${base}/${env.s3.bucket}/${key}`
}

function localObjectUrl(key, publicBaseUrl) {
  const base = (publicBaseUrl ?? `http://localhost:${env.port}`).replace(/\/$/, "")
  return `${base}/api/uploads/files/${key}`
}

function extForMime(mimeType) {
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3"
  if (mimeType.includes("webm")) return "webm"
  if (mimeType.includes("wav")) return "wav"
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a"
  return "m4a"
}

function imageExtForMime(mimeType) {
  if (mimeType.includes("png")) return "png"
  if (mimeType.includes("webp")) return "webp"
  if (mimeType.includes("gif")) return "gif"
  return "jpg"
}

async function uploadToS3({ buffer, mimeType, prefix }) {
  const s3 = getClient()
  if (!s3) throw new Error("S3 storage is not configured")

  const ext = extForMime(mimeType)
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${uid("audio")}.${ext}`

  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  )

  return { key, url: publicObjectUrl(key) }
}

async function uploadToLocal({ buffer, mimeType, prefix, publicBaseUrl }) {
  const ext = extForMime(mimeType)
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${uid("audio")}.${ext}`
  const filePath = path.join(LOCAL_UPLOAD_ROOT, key)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, buffer)
  return { key, url: localObjectUrl(key, publicBaseUrl) }
}

/**
 * Upload an audio buffer to S3 (or local disk in development when S3 fails).
 * @param {{ buffer: Buffer, mimeType: string, prefix?: string, publicBaseUrl?: string }} opts
 */
export async function uploadSpeakingAudio({
  buffer,
  mimeType,
  prefix = "speaking",
  publicBaseUrl,
}) {
  if (env.s3.enabled) {
    try {
      return await uploadToS3({ buffer, mimeType, prefix })
    } catch (err) {
      console.error("[s3] upload failed:", err?.message ?? err)
      if (isProd) throw err
      console.warn("[s3] falling back to local upload storage (development only)")
    }
  } else if (isProd) {
    throw new Error("S3 storage is not configured")
  }

  return uploadToLocal({ buffer, mimeType, prefix, publicBaseUrl })
}

async function uploadImageToS3({ buffer, mimeType, key }) {
  const s3 = getClient()
  if (!s3) throw new Error("S3 storage is not configured")

  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  )

  return { key, url: publicObjectUrl(key) }
}

async function uploadImageToLocal({ buffer, mimeType, key, publicBaseUrl }) {
  const filePath = path.join(LOCAL_UPLOAD_ROOT, key)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, buffer)
  return { key, url: localObjectUrl(key, publicBaseUrl) }
}

/**
 * Upload a profile avatar (one object key per user).
 * @param {{ buffer: Buffer, mimeType: string, userId: string, publicBaseUrl?: string }} opts
 */
export async function uploadAvatar({ buffer, mimeType, userId, publicBaseUrl }) {
  const ext = imageExtForMime(mimeType)
  const key = `avatars/${userId}.${ext}`

  if (env.s3.enabled) {
    try {
      return await uploadImageToS3({ buffer, mimeType, key })
    } catch (err) {
      console.error("[s3] avatar upload failed:", err?.message ?? err)
      if (isProd) throw err
      console.warn("[s3] falling back to local avatar storage (development only)")
    }
  } else if (isProd) {
    throw new Error("S3 storage is not configured")
  }

  return uploadImageToLocal({ buffer, mimeType, key, publicBaseUrl })
}
