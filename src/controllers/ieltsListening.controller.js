import { IeltsListening } from "../models/IeltsListening.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import {
  normalizeListeningInput,
  serializeListening,
  serializeListeningSummary,
} from "../services/ieltsListening.service.js"

export const listListeningSummaries = asyncHandler(async (_req, res) => {
  const docs = await IeltsListening.find()
    .select("slug title subtitle book test totalTimeMinutes questionCount questionTypes order data")
    .sort({ book: -1, test: -1, order: 1, title: 1 })
  res.json(docs.map(serializeListeningSummary))
})

export const listListenings = asyncHandler(async (_req, res) => {
  const docs = await IeltsListening.find().sort({ book: -1, test: -1, order: 1, title: 1 })
  res.json(docs.map(serializeListening))
})

export const getListening = asyncHandler(async (req, res) => {
  const doc = await IeltsListening.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Listening test not found")
  res.json(serializeListening(doc))
})

/** JSON bulk import — upsert by slug (idempotent). */
export const importListenings = asyncHandler(async (req, res) => {
  const { listenings = [] } = req.body
  let written = 0

  if (listenings.length > 0) {
    const ops = listenings.map((raw, idx) => {
      const item = normalizeListeningInput(raw, idx)
      return {
        updateOne: {
          filter: { _id: item.slug },
          update: {
            $set: {
              slug: item.slug,
              title: item.title,
              subtitle: item.subtitle ?? "",
              book: item.book,
              test: item.test,
              totalTimeMinutes: item.totalTimeMinutes,
              questionCount: item.questionCount,
              questionTypes: item.questionTypes,
              fullAudioUrl: item.fullAudioUrl,
              data: item.data,
              order: item.order,
            },
          },
          upsert: true,
        },
      }
    })
    const result = await IeltsListening.bulkWrite(ops, { ordered: false })
    written = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  await recordAudit({
    req,
    action: "import_listenings",
    category: "exercises",
    targetType: "ielts_listening",
    targetLabel: `${listenings.length} listening test(s)`,
    details: { listeningsWritten: written },
  })

  res.json({ ok: true, listeningsWritten: written })
})
