import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CurriculumBook } from "../models/CurriculumBook.js"

export const BOOK_ID = "cambridge-vocab-ielts-advanced"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_FILE = path.join(__dirname, "../data/books/cambridge-vocab-ielts-advanced.json")

function countReadyUnits(units = []) {
  return units.filter((u) => Array.isArray(u?.sections) && u.sections.length > 0).length
}

/**
 * Upsert platform curriculum books from seed JSON files.
 * Safe to run repeatedly — does not touch org-scoped data.
 */
export async function seedCurriculumBooks() {
  let raw
  try {
    raw = await fs.readFile(SEED_FILE, "utf8")
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.warn(`[seed:books] missing file: ${SEED_FILE}`)
      return { upserted: 0 }
    }
    throw err
  }

  const data = JSON.parse(raw)
  const units = Array.isArray(data.units) ? data.units : []
  const meta = data.book ?? {}
  const readyUnitCount = countReadyUnits(units)

  await CurriculumBook.updateOne(
    { _id: BOOK_ID },
    {
      $set: {
        slug: BOOK_ID,
        title: meta.title ?? BOOK_ID,
        author: meta.author ?? "",
        isbn: meta.isbn ?? "",
        publisher: meta.publisher ?? "",
        year: typeof meta.year === "number" ? meta.year : null,
        data: {
          book: meta,
          units,
          answer_key: data.answer_key ?? {},
          ...(Array.isArray(data.pages) ? { pages: data.pages } : {}),
          ...(data.tests ? { tests: data.tests } : {}),
        },
        unitCount: units.length,
        readyUnitCount,
        orgId: null,
        published: true,
      },
    },
    { upsert: true },
  )

  console.log(
    `[seed:books] ensured platform book: ${BOOK_ID} (${units.length} units, ${readyUnitCount} ready)`,
  )

  // Dynamic import avoids circular dependency with book.service ↔ seed.
  try {
    const { invalidateBookCache } = await import("../services/book.service.js")
    invalidateBookCache(BOOK_ID)
  } catch {
    /* cache may not be loaded yet */
  }

  return { upserted: 1, unitCount: units.length, readyUnitCount }
}
