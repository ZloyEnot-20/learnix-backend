import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

/** Reconstruct the client `GrammarExercise` shape from a stored doc. */
function serializeExercise(doc) {
  const data = doc.data ?? {}
  return { ...data, id: data.id ?? doc.slug, slug: doc.slug }
}

function serializeTopic(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description,
    levels: doc.levels,
    exerciseCount: doc.exerciseCount,
    questionCount: doc.questionCount,
    totalMinutes: doc.totalMinutes,
    order: doc.order,
  }
}

/** List the full exercise catalogue (optionally filtered by topic). */
export const listExercises = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.topic) filter.topic = req.query.topic
  if (req.query.category) filter.category = req.query.category
  const docs = await Exercise.find(filter).sort({ topic: 1, slug: 1 })
  res.json(docs.map(serializeExercise))
})

/** List all topic folders, ordered for display. */
export const listTopics = asyncHandler(async (_req, res) => {
  const docs = await Topic.find().sort({ order: 1, title: 1 })
  res.json(docs.map(serializeTopic))
})

export const getExercise = asyncHandler(async (req, res) => {
  const doc = await Exercise.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Exercise not found")
  res.json(serializeExercise(doc))
})

/**
 * Staff-only bulk import. Upserts topics + exercises by slug so the action is
 * idempotent — clicking the import button repeatedly never creates duplicates.
 */
export const importCatalog = asyncHandler(async (req, res) => {
  const { topics = [], exercises = [] } = req.body

  let topicsWritten = 0
  if (topics.length > 0) {
    const ops = topics.map((t, idx) => ({
      updateOne: {
        filter: { _id: t.slug },
        update: {
          $set: {
            slug: t.slug,
            title: t.title,
            description: t.description ?? "",
            levels: t.levels ?? "",
            exerciseCount: t.exerciseCount ?? 0,
            questionCount: t.questionCount ?? 0,
            totalMinutes: t.totalMinutes ?? 0,
            order: t.order ?? idx,
          },
        },
        upsert: true,
      },
    }))
    const result = await Topic.bulkWrite(ops, { ordered: false })
    topicsWritten = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  let exercisesWritten = 0
  if (exercises.length > 0) {
    const ops = exercises.map((ex) => {
      // Keep the full payload verbatim; ensure slug/id are consistent.
      const data = { ...ex, slug: ex.slug, id: ex.id ?? ex.slug }
      return {
        updateOne: {
          filter: { _id: ex.slug },
          update: {
            $set: {
              slug: ex.slug,
              title: ex.title,
              category: ex.category ?? "grammar",
              topic: ex.topic,
              subtopic: ex.subtopic ?? "",
              type: ex.type,
              level: ex.level ?? "",
              difficulty: ex.difficulty ?? "easy",
              estimatedTime: ex.estimatedTime ?? 0,
              totalQuestions: ex.totalQuestions ?? 0,
              data,
            },
          },
          upsert: true,
        },
      }
    })
    const result = await Exercise.bulkWrite(ops, { ordered: false })
    exercisesWritten = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  res.json({
    ok: true,
    topics: { received: topics.length, written: topicsWritten },
    exercises: { received: exercises.length, written: exercisesWritten },
  })
})
