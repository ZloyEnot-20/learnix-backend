import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { env } from "../config/env.js"
import { uid } from "../utils/ids.js"

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
    })
  }
  return client
}

/** Public URL for an object key in the configured bucket. */
export function publicObjectUrl(key) {
  const base = env.s3.endpoint.replace(/\/$/, "")
  return `${base}/${env.s3.bucket}/${key}`
}

/**
 * Upload an audio buffer to S3 and return its public URL.
 * @param {{ buffer: Buffer, mimeType: string, prefix?: string }} opts
 */
export async function uploadSpeakingAudio({ buffer, mimeType, prefix = "speaking" }) {
  const s3 = getClient()
  if (!s3) {
    throw new Error("S3 storage is not configured")
  }

  const ext = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : "m4a"

  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${uid("audio")}.${ext}`

  const baseParams = {
    Bucket: env.s3.bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }

  try {
    await s3.send(new PutObjectCommand({ ...baseParams, ACL: "public-read" }))
  } catch (err) {
    const msg = String(err?.message ?? err)
    if (!/acl|access control/i.test(msg)) throw err
    await s3.send(new PutObjectCommand(baseParams))
  }

  return { key, url: publicObjectUrl(key) }
}
