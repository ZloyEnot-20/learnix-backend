import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"
import { Level } from "../models/Level.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"

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
    color: doc.color ?? "",
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

/** Lightweight catalogue rows for list/browse screens (no question payloads). */
export const listExerciseSummaries = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.topic) filter.topic = req.query.topic
  if (req.query.category) filter.category = req.query.category
  const docs = await Exercise.find(filter)
    .select(
      "slug title topic subtopic category level type estimatedTime totalQuestions data.passingScore",
    )
    .sort({ topic: 1, slug: 1 })
    .lean()
  res.json(
    docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      topic: doc.topic,
      subtopic: doc.subtopic ?? "",
      category: doc.category ?? "grammar",
      level: doc.level ?? "",
      type: doc.type,
      estimatedTime: doc.estimatedTime ?? 0,
      totalQuestions: doc.totalQuestions ?? 0,
      passingScore: doc.data?.passingScore ?? 0,
    })),
  )
})

/** Resolve route metadata for a batch of exercise slugs (one DB round-trip). */
export const getExerciseMetaBatch = asyncHandler(async (req, res) => {
  const slugs = [...new Set((req.body.slugs ?? []).filter(Boolean))].slice(0, 50)
  if (slugs.length === 0) return res.json([])

  const docs = await Exercise.find({ _id: { $in: slugs } })
    .select("slug title topic subtopic category level totalQuestions data.passingScore")
    .lean()

  res.json(
    docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      topic: doc.topic,
      subtopic: doc.subtopic ?? "",
      category: doc.category ?? "grammar",
      level: doc.level ?? "",
      totalQuestions: doc.totalQuestions ?? 0,
      passingScore: doc.data?.passingScore ?? 0,
    })),
  )
})

/** List all topic folders, ordered for display. */
export const listTopics = asyncHandler(async (_req, res) => {
  const docs = await Topic.find().sort({ order: 1, title: 1 })
  res.json(docs.map(serializeTopic))
})

function serializeLevel(doc) {
  return {
    key: doc.key,
    label: doc.label ?? "",
    color: doc.color ?? "",
    comingSoon: Boolean(doc.comingSoon),
    cefr: doc.cefr ?? "",
    order: doc.order ?? 0,
  }
}

/** List extra (non-CEFR) level folders shown alongside A1–C2. */
export const listLevels = asyncHandler(async (_req, res) => {
  const docs = await Level.find().sort({ order: 1, key: 1 })
  res.json(docs.map(serializeLevel))
})

function serializeVocabDeck(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? "",
    level: doc.level ?? "A1",
    words: (doc.words ?? []).map((w) => ({
      id: w.id,
      term: w.term,
      partOfSpeech: w.partOfSpeech ?? "noun",
      definition: w.definition ?? "",
      example: w.example ?? "",
      translation: w.translation ?? "",
      translationUz: w.translationUz ?? "",
    })),
  }
}

function serializeVocabDeckSummary(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    description: doc.description ?? "",
    level: doc.level ?? "A1",
    wordCount: doc.wordCount ?? (doc.words ?? []).length,
  }
}

/** List vocabulary deck metadata without embedded words. */
export const listVocabDeckSummaries = asyncHandler(async (_req, res) => {
  const docs = await VocabDeck.aggregate([
    {
      $project: {
        slug: 1,
        title: 1,
        description: 1,
        level: 1,
        order: 1,
        wordCount: { $size: { $ifNull: ["$words", []] } },
      },
    },
    { $sort: { order: 1, title: 1 } },
  ])
  res.json(docs.map(serializeVocabDeckSummary))
})

/** List all vocabulary decks — available to any authenticated user. */
export const listVocabDecks = asyncHandler(async (_req, res) => {
  const docs = await VocabDeck.find().sort({ order: 1, title: 1 })
  res.json(docs.map(serializeVocabDeck))
})

export const getVocabDeck = asyncHandler(async (req, res) => {
  const doc = await VocabDeck.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Deck not found")
  res.json(serializeVocabDeck(doc))
})

/** Staff-only upsert of vocabulary decks by slug (idempotent). */
export const importVocabDecks = asyncHandler(async (req, res) => {
  const { decks = [] } = req.body
  let written = 0
  if (decks.length > 0) {
    const ops = decks.map((d, idx) => ({
      updateOne: {
        filter: { _id: d.slug },
        update: {
          $set: {
            slug: d.slug,
            title: d.title,
            description: d.description ?? "",
            level: d.level ?? "A1",
            words: d.words ?? [],
            order: d.order ?? idx,
          },
        },
        upsert: true,
      },
    }))
    const result = await VocabDeck.bulkWrite(ops, { ordered: false })
    written = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
  }

  await recordAudit({
    req,
    action: "import_vocab",
    category: "exercises",
    targetType: "vocab",
    targetLabel: `${decks.length} deck(s)`,
    details: { decksWritten: written },
  })

  res.json({ ok: true, decksWritten: written })
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
            color: t.color ?? "",
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

  await recordAudit({
    req,
    action: "import_catalog",
    category: "exercises",
    targetType: "catalog",
    targetLabel: `${topics.length} topics, ${exercises.length} exercises`,
    details: {
      topics: { received: topics.length, written: topicsWritten },
      exercises: { received: exercises.length, written: exercisesWritten },
    },
  })

  res.json({
    ok: true,
    topics: { received: topics.length, written: topicsWritten },
    exercises: { received: exercises.length, written: exercisesWritten },
  })
})
