import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"
import { Level } from "../models/Level.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import { canCrossTenant, resolveOrgId } from "../services/tenantScope.service.js"
import { uid } from "../utils/ids.js"

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Global platform decks (orgId absent) plus decks owned by the caller's org. */
function vocabVisibilityFilter(req) {
  const orgId = resolveOrgId(req)
  if (!orgId) {
    if (canCrossTenant(req)) return {}
    return { $or: [{ orgId: null }, { orgId: { $exists: false } }] }
  }
  return { $or: [{ orgId: null }, { orgId: { $exists: false } }, { orgId }] }
}

/** Global platform exercises plus exercises owned by the caller's org. */
function exerciseVisibilityFilter(req) {
  const orgId = resolveOrgId(req)
  if (!orgId) {
    if (canCrossTenant(req)) return {}
    return { $or: [{ orgId: null }, { orgId: { $exists: false } }] }
  }
  return { $or: [{ orgId: null }, { orgId: { $exists: false } }, { orgId }] }
}

function assertVocabDeckAccess(doc, req) {
  if (!doc?.orgId) return
  const orgId = resolveOrgId(req)
  if (canCrossTenant(req) && !orgId) return
  if (doc.orgId !== orgId) throw ApiError.notFound("Deck not found")
}

function assertExerciseAccess(doc, req) {
  if (!doc?.orgId) return
  const orgId = resolveOrgId(req)
  if (canCrossTenant(req) && !orgId) return
  if (doc.orgId !== orgId) throw ApiError.notFound("Exercise not found")
}

function buildOrgDeckSlug(orgId, topic, title) {
  const base = slugify(`${topic}-${title}`) || "deck"
  return `${orgId}--${base}`.slice(0, 200)
}

function buildOrgSpeakingTopicSlug(orgId, level) {
  return `${orgId}--speaking-${level.toLowerCase()}`.slice(0, 200)
}

function buildOrgSpeakingExerciseSlug(orgId, title) {
  const base = slugify(title) || "speaking-set"
  return `${orgId}--speaking-${base}`.slice(0, 200)
}

const SPEAKING_LEVEL_META = {
  A1: { difficulty: "easy", estimatedTime: 15, prepTime: 15, speakTime: 30 },
  A2: { difficulty: "easy", estimatedTime: 18, prepTime: 20, speakTime: 45 },
  B1: { difficulty: "medium", estimatedTime: 20, prepTime: 30, speakTime: 60 },
  B2: { difficulty: "medium", estimatedTime: 25, prepTime: 45, speakTime: 90 },
  C1: { difficulty: "hard", estimatedTime: 30, prepTime: 60, speakTime: 120 },
  C2: { difficulty: "hard", estimatedTime: 35, prepTime: 60, speakTime: 150 },
}

function normalizeVocabWords(words = []) {
  return words.map((w, idx) => ({
    id: w.id?.trim() || `w-${uid("vw").slice(-8)}-${idx}`,
    term: w.term.trim(),
    partOfSpeech: w.partOfSpeech?.trim() || "noun",
    definition: w.definition?.trim() ?? "",
    example: w.example?.trim() ?? "",
    translation: w.translation?.trim() ?? "",
    translationUz: w.translationUz?.trim() ?? "",
  }))
}

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
  const filter = { ...exerciseVisibilityFilter(req) }
  if (req.query.topic) filter.topic = req.query.topic
  if (req.query.category) filter.category = req.query.category
  const docs = await Exercise.find(filter).sort({ topic: 1, slug: 1 })
  res.json(docs.map(serializeExercise))
})

/** Lightweight catalogue rows for list/browse screens (no question payloads). */
export const listExerciseSummaries = asyncHandler(async (req, res) => {
  const filter = { ...exerciseVisibilityFilter(req) }
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
    topic: doc.topic ?? "",
    difficulty: doc.difficulty ?? "medium",
    orgId: doc.orgId ?? null,
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
    topic: doc.topic ?? "",
    difficulty: doc.difficulty ?? "medium",
    orgId: doc.orgId ?? null,
    wordCount: doc.wordCount ?? (doc.words ?? []).length,
  }
}

/** List vocabulary deck metadata without embedded words. */
export const listVocabDeckSummaries = asyncHandler(async (req, res) => {
  const filter = vocabVisibilityFilter(req)
  const docs = await VocabDeck.aggregate([
    { $match: filter },
    {
      $project: {
        slug: 1,
        title: 1,
        description: 1,
        level: 1,
        topic: 1,
        difficulty: 1,
        orgId: 1,
        order: 1,
        wordCount: { $size: { $ifNull: ["$words", []] } },
      },
    },
    { $sort: { order: 1, title: 1 } },
  ])
  res.json(docs.map(serializeVocabDeckSummary))
})

/** List vocabulary decks visible to the caller (global + own org). */
export const listVocabDecks = asyncHandler(async (req, res) => {
  const filter = vocabVisibilityFilter(req)
  const docs = await VocabDeck.find(filter).sort({ order: 1, title: 1 })
  res.json(docs.map(serializeVocabDeck))
})

/** Org-owned decks only — for the admin "add to existing deck" picker. */
export const listOrgVocabDecks = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")
  const docs = await VocabDeck.find({ orgId }).sort({ updatedAt: -1, title: 1 })
  res.json(docs.map(serializeVocabDeckSummary))
})

export const getVocabDeck = asyncHandler(async (req, res) => {
  const doc = await VocabDeck.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Deck not found")
  assertVocabDeckAccess(doc, req)
  res.json(serializeVocabDeck(doc))
})

/** Staff-only upsert of vocabulary decks by slug (idempotent). */
export const importVocabDecks = asyncHandler(async (req, res) => {
  const { decks = [] } = req.body
  const orgId = resolveOrgId(req)
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
            topic: d.topic ?? "",
            difficulty: d.difficulty ?? "medium",
            orgId: orgId ?? d.orgId ?? null,
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

/** Org admin UI: create a deck or append words to an existing org deck. */
export const manageOrgVocab = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  const {
    mode,
    deckSlug,
    title,
    topic,
    level = "A1",
    difficulty = "medium",
    words = [],
  } = req.body

  if (level !== "A1") {
    throw ApiError.badRequest("Only Stage 1 (A1) vocabulary is supported for now")
  }

  const normalizedWords = normalizeVocabWords(words)
  if (normalizedWords.length === 0) {
    throw ApiError.badRequest("Add at least one word")
  }

  let deck
  let wordsAdded = normalizedWords.length

  if (mode === "append") {
    if (!deckSlug) throw ApiError.badRequest("Select a deck to add words to")
    deck = await VocabDeck.findOne({ _id: deckSlug, orgId })
    if (!deck) throw ApiError.notFound("Deck not found in your organization")

    const existingTerms = new Set((deck.words ?? []).map((w) => w.term.toLowerCase()))
    const toAdd = normalizedWords.filter((w) => !existingTerms.has(w.term.toLowerCase()))
    wordsAdded = toAdd.length
    deck.words = [...(deck.words ?? []), ...toAdd]
    if (topic?.trim()) deck.topic = topic.trim()
    if (difficulty) deck.difficulty = difficulty
    await deck.save()
  } else if (mode === "create") {
    const deckTitle = title?.trim()
    const deckTopic = topic?.trim()
    if (!deckTitle) throw ApiError.badRequest("Deck title is required")
    if (!deckTopic) throw ApiError.badRequest("Topic is required")

    const slug = buildOrgDeckSlug(orgId, deckTopic, deckTitle)
    const existing = await VocabDeck.findById(slug)
    if (existing) throw ApiError.conflict("A deck with this name already exists. Choose another title or add to the existing deck.")

    deck = await VocabDeck.create({
      _id: slug,
      slug,
      title: deckTitle,
      description: `Vocabulary — ${deckTopic}`,
      level: level ?? "A1",
      topic: deckTopic,
      difficulty,
      orgId,
      words: normalizedWords,
      order: Date.now(),
    })
  } else {
    throw ApiError.badRequest("Invalid mode")
  }

  await recordAudit({
    req,
    action: mode === "append" ? "append_vocab" : "create_vocab",
    category: "exercises",
    targetType: "vocab",
    targetId: deck.slug,
    targetLabel: deck.title,
    details: { wordsAdded, topic: deck.topic, difficulty: deck.difficulty },
  })

  res.json({
    ok: true,
    deck: serializeVocabDeck(deck),
    wordsAdded,
  })
})

function serializeSpeakingSetSummary(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    level: doc.level ?? "A1",
    questionCount: doc.totalQuestions ?? doc.data?.content?.questions?.length ?? 0,
  }
}

function normalizeSpeakingPrompts(prompts = [], level) {
  const meta = SPEAKING_LEVEL_META[level] ?? SPEAKING_LEVEL_META.A1
  return prompts.map((p, idx) => ({
    id: idx + 1,
    text: p.text.trim(),
    hint: p.hint?.trim() ?? "",
    explanation: p.explanation?.trim() ?? "",
    prepTimeSeconds: meta.prepTime,
    speakTimeSeconds: meta.speakTime,
  }))
}

async function syncOrgSpeakingTopic(orgId, level) {
  const topicSlug = buildOrgSpeakingTopicSlug(orgId, level)
  const meta = SPEAKING_LEVEL_META[level] ?? SPEAKING_LEVEL_META.A1
  const exercises = await Exercise.find({ orgId, category: "speaking", level })
    .select("totalQuestions")
    .lean()
  const exerciseCount = exercises.length
  const questionCount = exercises.reduce((sum, ex) => sum + (ex.totalQuestions ?? 0), 0)
  if (exerciseCount === 0) return topicSlug

  await Topic.findByIdAndUpdate(
    topicSlug,
    {
      $set: {
        slug: topicSlug,
        title: `Speaking — ${level}`,
        description: `Custom speaking prompts for ${level} learners in your organization.`,
        levels: level,
        exerciseCount,
        questionCount,
        totalMinutes: meta.estimatedTime * exerciseCount,
        order: 200 + ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(level),
      },
    },
    { upsert: true },
  )
  return topicSlug
}

function buildSpeakingExerciseData({ slug, title, level, topicSlug, questions }) {
  const meta = SPEAKING_LEVEL_META[level] ?? SPEAKING_LEVEL_META.A1
  return {
    slug,
    id: slug,
    title,
    description: `${questions.length} speaking prompt${questions.length === 1 ? "" : "s"} for ${level} learners.`,
    category: "speaking",
    topic: topicSlug,
    subtopic: "practice",
    difficulty: meta.difficulty,
    level,
    type: "speaking",
    estimatedTime: meta.estimatedTime,
    totalQuestions: questions.length,
    passingScore: questions.length,
    tags: ["speaking", level, "custom"],
    instructions:
      "Read each question, prepare your answer, then tap Record. You can pause, listen to your recording, and re-record before submitting.",
    tips: [
      "Speak clearly and at a natural pace.",
      "Use the hint to guide what to describe.",
      "Listen to your recording before submitting.",
    ],
    content: { questions },
  }
}

/** Org-owned speaking sets for the admin picker. */
export const listOrgSpeakingSets = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")
  const docs = await Exercise.find({ orgId, category: "speaking" })
    .select("slug title level totalQuestions data.content.questions")
    .sort({ updatedAt: -1, title: 1 })
    .lean()
  res.json(docs.map(serializeSpeakingSetSummary))
})

/** Org staff UI: create a speaking set or append prompts to an existing one. */
export const manageOrgSpeaking = asyncHandler(async (req, res) => {
  const orgId = resolveOrgId(req)
  if (!orgId) throw ApiError.forbidden("Organization context required")

  const {
    mode,
    exerciseSlug,
    title,
    level = "A1",
    prompts = [],
  } = req.body

  const meta = SPEAKING_LEVEL_META[level] ?? SPEAKING_LEVEL_META.A1
  const normalizedIncoming = normalizeSpeakingPrompts(prompts, level)
  if (normalizedIncoming.length === 0) {
    throw ApiError.badRequest("Add at least one prompt")
  }

  let exercise
  let promptsAdded = normalizedIncoming.length

  if (mode === "append") {
    if (!exerciseSlug) throw ApiError.badRequest("Select a speaking set first")
    exercise = await Exercise.findOne({ _id: exerciseSlug, orgId, category: "speaking" })
    if (!exercise) throw ApiError.notFound("Speaking set not found in your organization")

    const existingQuestions = exercise.data?.content?.questions ?? []
    const startId = existingQuestions.length
    const toAdd = normalizedIncoming.map((q, i) => ({ ...q, id: startId + i + 1 }))
    const merged = [...existingQuestions, ...toAdd]
    const data = buildSpeakingExerciseData({
      slug: exercise.slug,
      title: exercise.title,
      level: exercise.level ?? level,
      topicSlug: exercise.topic,
      questions: merged,
    })

    exercise.data = data
    exercise.totalQuestions = merged.length
    exercise.estimatedTime = meta.estimatedTime
    exercise.difficulty = meta.difficulty
    await exercise.save()
    await syncOrgSpeakingTopic(orgId, exercise.level ?? level)
  } else if (mode === "create") {
    const setTitle = title?.trim()
    if (!setTitle) throw ApiError.badRequest("Set title is required")

    const slug = buildOrgSpeakingExerciseSlug(orgId, setTitle)
    const existing = await Exercise.findById(slug)
    if (existing) {
      throw ApiError.conflict(
        "A speaking set with this name already exists. Choose another title or add to the existing set.",
      )
    }

    const topicSlug = buildOrgSpeakingTopicSlug(orgId, level)
    const data = buildSpeakingExerciseData({
      slug,
      title: setTitle,
      level,
      topicSlug,
      questions: normalizedIncoming,
    })

    exercise = await Exercise.create({
      _id: slug,
      slug,
      title: setTitle,
      category: "speaking",
      topic: topicSlug,
      subtopic: "practice",
      type: "speaking",
      level,
      difficulty: meta.difficulty,
      estimatedTime: meta.estimatedTime,
      totalQuestions: normalizedIncoming.length,
      orgId,
      data,
    })
    await syncOrgSpeakingTopic(orgId, level)
  } else {
    throw ApiError.badRequest("Invalid mode")
  }

  await recordAudit({
    req,
    action: mode === "append" ? "append_speaking" : "create_speaking",
    category: "exercises",
    targetType: "speaking",
    targetId: exercise.slug,
    targetLabel: exercise.title,
    details: { promptsAdded, level: exercise.level },
  })

  res.json({
    ok: true,
    exercise: serializeExercise(exercise),
    promptsAdded,
  })
})

export const getExercise = asyncHandler(async (req, res) => {
  const doc = await Exercise.findById(req.params.slug)
  if (!doc) throw ApiError.notFound("Exercise not found")
  assertExerciseAccess(doc, req)
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
