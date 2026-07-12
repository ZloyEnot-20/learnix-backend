import { CurriculumBook } from "../models/CurriculumBook.js"
import { ApiError } from "../utils/ApiError.js"
import { seedCurriculumBooks, BOOK_ID as SEED_BOOK_ID } from "../seed/curriculum-books-seed.js"

export const BOOK_ID = SEED_BOOK_ID

/** In-memory cache — books are large and shared; avoid re-reading Mongo on every exercise select. */
const bookCache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheGet(id) {
  const hit = bookCache.get(id)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    bookCache.delete(id)
    return null
  }
  return hit.doc
}

function cacheSet(id, doc) {
  bookCache.set(id, { at: Date.now(), doc })
}

export function invalidateBookCache(bookId) {
  if (bookId) bookCache.delete(bookId)
  else bookCache.clear()
}

/** Flatten unit exercises: nested → orphan → test_practice. */
export function flattenUnitExerciseIds(unit) {
  const ids = []
  if (!unit) return ids

  for (const section of unit.sections ?? []) {
    if (section?.section_type === "test_practice") {
      ids.push("test_practice")
      continue
    }

    if (Array.isArray(section?.exercises)) {
      for (const ex of section.exercises) {
        if (ex?.exercise_id) ids.push(String(ex.exercise_id))
      }
    }

    if (section?.exercise_id) {
      ids.push(String(section.exercise_id))
    }
  }

  if (unit.test_practice != null && !ids.includes("test_practice")) {
    ids.push("test_practice")
  }

  return ids
}

/**
 * Strip answer fields from exercise payloads for student-facing responses.
 * Does not mutate the cached book document.
 */
export function stripAnswersFromUnit(unit) {
  if (!unit) return unit
  const clone = structuredClone(unit)

  const scrubNode = (node) => {
    if (!node || typeof node !== "object") return

    // Keep classification / prefix bucket labels, clear contents
    if (node.answers && typeof node.answers === "object" && !Array.isArray(node.answers)) {
      node.answers = Object.fromEntries(Object.keys(node.answers).map((k) => [k, []]))
    } else {
      delete node.answers
    }
    delete node.answer

    if (Array.isArray(node.questions)) {
      for (const q of node.questions) {
        if (q && typeof q === "object" && !Array.isArray(q)) delete q.answer
      }
    }

    if (Array.isArray(node.items)) {
      for (const it of node.items) {
        if (!it || typeof it !== "object" || Array.isArray(it)) continue
        delete it.answer
        if ("speaker" in it) {
          delete it.person
          delete it.adjectives
        }
        if ("original" in it && "paraphrase" in it) {
          delete it.paraphrase
        }
      }
    }

    if (Array.isArray(node.sentences)) {
      for (const s of node.sentences) {
        if (s && typeof s === "object") delete s.answer
      }
    }

    if (Array.isArray(node.paraphrases)) {
      node.paraphrases = node.paraphrases.map((p) =>
        p && typeof p === "object" ? { original: p.original } : p,
      )
    }

    if (node.table && typeof node.table === "object") {
      node.table = Object.fromEntries(Object.keys(node.table).map((k) => [k, []]))
    }

    if (node.speaker_1_expressions) node.speaker_1_expressions = []
    if (node.speaker_2_expressions) node.speaker_2_expressions = []
    if (node.speaker_1 && typeof node.speaker_1 === "string") node.speaker_1 = ""
    if (node.speaker_2 && typeof node.speaker_2 === "string") node.speaker_2 = ""
  }

  for (const section of clone.sections ?? []) {
    if (section.section_type === "test_practice") {
      delete section.answers
      scrubNode(section)
      continue
    }
    if (Array.isArray(section.exercises)) {
      for (const ex of section.exercises) scrubNode(ex)
    }
    if (section.exercise_id) scrubNode(section)
  }

  return clone
}

function toBookDoc(row) {
  const data = row.data ?? {}
  return {
    bookId: row._id || row.slug,
    book: data.book ?? {
      title: row.title,
      author: row.author,
      isbn: row.isbn,
      publisher: row.publisher,
      year: row.year,
    },
    units: data.units ?? [],
    answer_key: data.answer_key ?? {},
    tests: data.tests,
    unitCount: row.unitCount ?? (data.units?.length ?? 0),
    readyUnitCount: row.readyUnitCount ?? 0,
    orgId: row.orgId ?? null,
  }
}

/**
 * Load a published platform book (orgId null) or ensure seed once if DB empty.
 */
export async function loadBook(bookId) {
  const id = String(bookId || "").trim()
  if (!id) throw ApiError.badRequest("bookId is required")

  const cached = cacheGet(id)
  if (cached) return cached

  let row = await CurriculumBook.findOne({
    _id: id,
    published: true,
    $or: [{ orgId: null }, { orgId: { $exists: false } }],
  })

  if (!row && id === BOOK_ID) {
    // First boot / empty DB — seed platform book once, then retry.
    await seedCurriculumBooks()
    row = await CurriculumBook.findOne({ _id: id, published: true })
  }

  if (!row) throw ApiError.notFound(`Book not found: ${id}`)

  const doc = toBookDoc(row)
  cacheSet(id, doc)
  return doc
}

export async function listBooks() {
  let rows = await CurriculumBook.find({
    published: true,
    $or: [{ orgId: null }, { orgId: { $exists: false } }],
  })
    .select("_id slug title author year unitCount readyUnitCount orgId")
    .sort({ title: 1 })
    .lean()

  if (rows.length === 0) {
    await seedCurriculumBooks()
    rows = await CurriculumBook.find({
      published: true,
      $or: [{ orgId: null }, { orgId: { $exists: false } }],
    })
      .select("_id slug title author year unitCount readyUnitCount orgId")
      .sort({ title: 1 })
      .lean()
  }

  return rows.map((r) => ({
    id: r._id || r.slug,
    bookId: r._id || r.slug,
    title: r.title,
    author: r.author || null,
    year: r.year ?? null,
    unitCount: r.unitCount ?? 0,
    readyUnitCount: r.readyUnitCount ?? 0,
  }))
}

export async function getUnit(bookId, unitNumber, { includeAnswers = true } = {}) {
  const book = await loadBook(bookId)
  const n = Number(unitNumber)
  if (!Number.isFinite(n)) throw ApiError.badRequest("unitNumber must be a number")

  const unit = (book.units ?? []).find((u) => Number(u.unit_number) === n)
  if (!unit) throw ApiError.notFound(`Unit ${n} not found in book ${bookId}`)

  const keyName = `unit_${n}`
  const answerKey = includeAnswers ? (book.answer_key?.[keyName] ?? null) : null
  const safeUnit = includeAnswers ? unit : stripAnswersFromUnit(unit)

  return {
    bookId,
    book: book.book ?? null,
    unit: safeUnit,
    exerciseIds: flattenUnitExerciseIds(unit),
    answer_key: answerKey,
  }
}
