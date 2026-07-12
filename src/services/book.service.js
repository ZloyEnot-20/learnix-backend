import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ApiError } from "../utils/ApiError.js"

export const BOOK_ID = "cambridge-vocab-ielts-advanced"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOKS_DIR = path.join(__dirname, "../data/books")

const bookCache = new Map()

function bookFilePath(bookId) {
  return path.join(BOOKS_DIR, `${bookId}.json`)
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

    // Orphan exercise sitting directly on the section
    if (section?.exercise_id) {
      ids.push(String(section.exercise_id))
    }
  }

  if (unit.test_practice != null && !ids.includes("test_practice")) {
    ids.push("test_practice")
  }

  return ids
}

export async function loadBook(bookId) {
  const id = String(bookId || "").trim()
  if (!id) throw ApiError.badRequest("bookId is required")

  if (bookCache.has(id)) return bookCache.get(id)

  let raw
  try {
    raw = await fs.readFile(bookFilePath(id), "utf8")
  } catch (err) {
    if (err?.code === "ENOENT") throw ApiError.notFound(`Book not found: ${id}`)
    throw err
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch {
    throw ApiError.badRequest(`Invalid book JSON: ${id}`)
  }

  const book = { bookId: id, ...data }
  bookCache.set(id, book)
  return book
}

export async function listBooks() {
  let entries
  try {
    entries = await fs.readdir(BOOKS_DIR)
  } catch (err) {
    if (err?.code === "ENOENT") return []
    throw err
  }

  const books = []
  for (const name of entries) {
    if (!name.endsWith(".json")) continue
    const bookId = name.slice(0, -5)
    const data = await loadBook(bookId)
    books.push({
      bookId,
      title: data.book?.title ?? bookId,
      author: data.book?.author ?? null,
      unitCount: Array.isArray(data.units) ? data.units.length : 0,
    })
  }
  return books
}

export async function getUnit(bookId, unitNumber) {
  const book = await loadBook(bookId)
  const n = Number(unitNumber)
  if (!Number.isFinite(n)) throw ApiError.badRequest("unitNumber must be a number")

  const unit = (book.units ?? []).find((u) => Number(u.unit_number) === n)
  if (!unit) throw ApiError.notFound(`Unit ${n} not found in book ${bookId}`)

  return {
    bookId,
    book: book.book ?? null,
    unit,
    exerciseIds: flattenUnitExerciseIds(unit),
  }
}
