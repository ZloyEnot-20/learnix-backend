import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { uploadSpeakingAudio } from "../services/s3.service.js"
import { env } from "../config/env.js"

const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/aac",
])

/** POST /uploads/speaking-audio — multipart field `audio` */
export const uploadSpeakingAudioHandler = asyncHandler(async (req, res) => {
  if (!env.s3.enabled) {
    throw ApiError.internal("S3 storage is not configured on the server")
  }

  const file = req.file
  if (!file) throw ApiError.badRequest("No audio file provided")

  if (file.size > MAX_BYTES) {
    throw ApiError.badRequest("Audio file is too large (max 15 MB)")
  }

  const mime = file.mimetype || "audio/m4a"
  if (!ALLOWED_TYPES.has(mime)) {
    throw ApiError.badRequest(`Unsupported audio type: ${mime}`)
  }

  const { url, key } = await uploadSpeakingAudio({
    buffer: file.buffer,
    mimeType: mime,
    prefix: `speaking/${req.user.id}`,
  })

  res.status(201).json({ url, key })
})
