import { IeltsReading } from "../models/IeltsReading.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import {
  normalizeReadingInput,
  serializeReading,
  serializeReadingSummary,
} from "../services/ieltsReading.service.js"

export const listReadingSummaries = asyncHandler(async (_req, res) => {
  const docs = await IeltsReading.find()
    .select("slug title subtitle totalTimeMinutes questionCount order questionTypes level data")
    .sort({ order: 1, title: 1 })
  res.json(docs.map(serializeReadingSummary))
})

export const listReadings = asyncHandler(async (_req, res) => {
  const docs = await IeltsReading.find().sort({ order: 1, title: 1 })
  res.json(docs.map(serializeReading))
})

export const getReading = asyncHandler(async (req, res) => {
  const doc = await IeltsReading.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Reading test not found")
  res.json(serializeReading(doc))
})

/** JSON bulk import — upsert by slug (idempotent). */
export const importReadings = asyncHandler(async (req, res) => {
  const { readings = [] } = req.body
  let written = 0

  if (readings.length > 0) {
    const ops = readings.map((raw, idx) => {
      const item = normalizeReadingInput(raw, idx)
      return {
        updateOne: {
          filter: { _id: item.slug },
          update: {
            $set: {
              slug: item.slug,
              title: item.title,
              subtitle: item.subtitle ?? "",
              totalTimeMinutes: item.totalTimeMinutes,
              questionCount: item.questionCount,
              questionTypes: item.questionTypes,
              level: item.level ?? "",
              data: item.data,
              order: item.order,
            },
          },
          upsert: true,
        },
      }
    })
    const result = await IeltsReading.bulkWrite(ops, { ordered: false })
    written = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  await recordAudit({
    req,
    action: "import_readings",
    category: "exercises",
    targetType: "ielts_reading",
    targetLabel: `${readings.length} reading test(s)`,
    details: { readingsWritten: written },
  })

  res.json({ ok: true, readingsWritten: written })
})
