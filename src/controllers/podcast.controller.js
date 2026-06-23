import { Podcast } from "../models/Podcast.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import { uploadSpeakingAudio } from "../services/s3.service.js"
import {
  parsePodcastWordsJson,
  serializePodcast,
  serializePodcastSummary,
  validatePodcastMeta,
  normalizePodcastWord,
  slugifyPodcast,
} from "../services/podcast.service.js"

const MAX_AUDIO_BYTES = 30 * 1024 * 1024
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/m4a",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/aac",
])

export const listPodcasts = asyncHandler(async (_req, res) => {
  const docs = await Podcast.find().sort({ order: 1, title: 1 })
  res.json(docs.map(serializePodcast))
})

/** Podcast catalogue metadata for list screens (no audio URLs or word payloads). */
export const listPodcastSummaries = asyncHandler(async (_req, res) => {
  const docs = await Podcast.aggregate([
    {
      $project: {
        slug: 1,
        title: 1,
        topic: 1,
        description: 1,
        level: 1,
        difficulty: 1,
        durationMinutes: 1,
        order: 1,
        wordCount: { $size: { $ifNull: ["$words", []] } },
      },
    },
    { $sort: { order: 1, title: 1 } },
  ])
  res.json(docs.map(serializePodcastSummary))
})

export const getPodcast = asyncHandler(async (req, res) => {
  const doc = await Podcast.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Podcast not found")
  res.json(serializePodcast(doc))
})

/**
 * POST /exercises/podcasts/upload — multipart
 * Fields: title, topic, level, difficulty, description?, slug?, durationMinutes?, words? (JSON string)
 * File: audio (required)
 */
export const uploadPodcast = asyncHandler(async (req, res) => {
  const file = req.file
  if (!file) throw ApiError.badRequest("No audio file provided (field: audio)")

  if (file.size > MAX_AUDIO_BYTES) {
    throw ApiError.badRequest("Audio file is too large (max 30 MB)")
  }

  const mime = file.mimetype || "audio/mpeg"
  if (!ALLOWED_AUDIO_TYPES.has(mime)) {
    throw ApiError.badRequest(`Unsupported audio type: ${mime}`)
  }

  let meta
  try {
    meta = validatePodcastMeta(req.body)
  } catch (err) {
    throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid metadata")
  }

  let words = []
  if (req.body.words != null && String(req.body.words).trim() !== "") {
    try {
      words = parsePodcastWordsJson(req.body.words)
    } catch (err) {
      throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid words JSON")
    }
  }

  const publicBaseUrl =
    process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`

  const { url: audioUrl } = await uploadSpeakingAudio({
    buffer: file.buffer,
    mimeType: mime,
    prefix: `podcasts/${meta.slug}`,
    publicBaseUrl,
  })

  const count = await Podcast.countDocuments()
  const doc = await Podcast.findByIdAndUpdate(
    meta.slug,
    {
      $set: {
        slug: meta.slug,
        title: meta.title,
        topic: meta.topic,
        description: meta.description,
        level: meta.level,
        difficulty: meta.difficulty,
        audioUrl,
        durationMinutes: meta.durationMinutes,
        words,
        order: count,
      },
    },
    { upsert: true, new: true },
  )

  await recordAudit({
    req,
    action: "upload_podcast",
    category: "exercises",
    targetType: "podcast",
    targetId: meta.slug,
    targetLabel: meta.title,
    details: { topic: meta.topic, level: meta.level, difficulty: meta.difficulty, wordCount: words.length },
  })

  res.status(201).json({ ok: true, podcast: serializePodcast(doc) })
})

/** JSON bulk import — upsert by slug (idempotent). */
export const importPodcasts = asyncHandler(async (req, res) => {
  const { podcasts = [] } = req.body
  let written = 0
  if (podcasts.length > 0) {
    const ops = podcasts.map((p, idx) => {
      const slug = slugifyPodcast(p.slug) || slugifyPodcast(p.title) || `podcast-${idx}`
      const words = (p.words ?? []).map((w) => normalizePodcastWord(w)).filter(Boolean)
      return {
        updateOne: {
          filter: { _id: slug },
          update: {
            $set: {
              slug,
              title: p.title,
              topic: p.topic,
              description: p.description ?? "",
              level: p.level ?? "A1",
              difficulty: p.difficulty ?? "easy",
              audioUrl: p.audioUrl,
              durationMinutes: p.durationMinutes ?? 0,
              words,
              order: p.order ?? idx,
            },
          },
          upsert: true,
        },
      }
    })
    const result = await Podcast.bulkWrite(ops, { ordered: false })
    written = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  await recordAudit({
    req,
    action: "import_podcasts",
    category: "exercises",
    targetType: "podcast",
    targetLabel: `${podcasts.length} podcast(s)`,
    details: { podcastsWritten: written },
  })

  res.json({ ok: true, podcastsWritten: written })
})
