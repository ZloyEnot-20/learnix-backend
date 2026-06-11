import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { uploadSpeakingAudio, uploadAvatar } from "../services/s3.service.js"
import { User } from "../models/User.js"
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

  const publicBaseUrl =
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get("host")}`

  const { url, key } = await uploadSpeakingAudio({
    buffer: file.buffer,
    mimeType: mime,
    prefix: `speaking/${req.user.id}`,
    publicBaseUrl,
  })

  res.status(201).json({ url, key })
})

const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
])

/** POST /uploads/avatar — multipart field `photo` (one-time per user) */
export const uploadAvatarHandler = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) throw ApiError.unauthorized()

  if (user.avatarUrl) {
    throw ApiError.conflict("Profile photo can only be uploaded once")
  }

  const file = req.file
  if (!file) throw ApiError.badRequest("No image file provided")

  if (file.size > AVATAR_MAX_BYTES) {
    throw ApiError.badRequest("Image is too large (max 5 MB)")
  }

  const mime = file.mimetype || "image/jpeg"
  if (!AVATAR_ALLOWED_TYPES.has(mime)) {
    throw ApiError.badRequest(`Unsupported image type: ${mime}`)
  }

  const publicBaseUrl =
    env.s3.publicApiUrl ||
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get("host")}`

  const { url } = await uploadAvatar({
    buffer: file.buffer,
    mimeType: mime,
    userId: user._id,
    publicBaseUrl,
  })

  user.avatarUrl = url
  await user.save()

  res.status(201).json({ url, user: user.toSafeJSON() })
})
