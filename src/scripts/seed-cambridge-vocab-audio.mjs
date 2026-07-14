/**
 * Upload Cambridge Vocab IELTS Advanced CD tracks to S3 and store URLs on CurriculumBook.
 *
 * Usage:
 *   node src/scripts/seed-cambridge-vocab-audio.mjs "C:\path\to\folder"
 *   npm run seed:cambridge-audio -- "C:\path\to\folder"
 *
 * Filenames should end with a track number, e.g.:
 *   Vocabulary for IELTS Advanced 02.mp3  → key "02"
 *
 * Stored as data.audio_urls: { "01": "https://…", "02": "https://…", … }
 */
import fs from "node:fs"
import path from "node:path"
import { setServers } from "node:dns"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { CurriculumBook } from "../models/CurriculumBook.js"
import { BOOK_ID } from "../seed/curriculum-books-seed.js"
import { uploadBookListeningTrack } from "../services/s3.service.js"
import { invalidateBookCache } from "../services/book.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

function trackKeyFromFilename(name) {
  const m = String(name).match(/(\d+)\.mp3$/i)
  if (!m) return null
  return String(Number(m[1])).padStart(2, "0")
}

function listMp3s(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Audio folder not found: ${dir}`)
  }
  return fs
    .readdirSync(dir)
    .filter((f) => /\.mp3$/i.test(f))
    .filter((f) => /Vocabulary for IELTS Advanced\s+\d+\.mp3$/i.test(f))
    .sort((a, b) => {
      const na = Number(trackKeyFromFilename(a) ?? 0)
      const nb = Number(trackKeyFromFilename(b) ?? 0)
      return na - nb
    })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function uploadWithRetry(filePath, track, attempts = 4) {
  const buffer = fs.readFileSync(filePath)
  let lastErr
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await uploadBookListeningTrack({
        buffer,
        bookId: BOOK_ID,
        track,
        requireS3: true,
        publicBaseUrl: process.env.PUBLIC_API_URL || `http://localhost:${env.port}`,
      })
      return result
    } catch (err) {
      lastErr = err
      console.warn(
        `[seed:cambridge-audio] retry ${i}/${attempts} for ${track}:`,
        err?.message ?? err,
      )
      await sleep(400 * i)
    }
  }
  throw lastErr
}

async function seedBookAudio(folder) {
  if (!env.s3.enabled) {
    throw new Error("S3 is not configured — refuse to seed book audio to local disk")
  }

  const files = listMp3s(folder)
  if (files.length === 0) {
    throw new Error(`No matching .mp3 files in ${folder}`)
  }

  console.log(`[seed:cambridge-audio] found ${files.length} file(s) in ${folder}`)
  console.log(`[seed:cambridge-audio] S3 enabled: ${env.s3.enabled}`)

  const existing = await CurriculumBook.findById(BOOK_ID).lean()
  if (!existing) {
    throw new Error(
      `Book ${BOOK_ID} not found in MongoDB. Run npm run seed:books first.`,
    )
  }

  /** Fresh map — do not keep stale localhost / junk keys from prior failed runs. */
  const audio_urls = {}

  let uploaded = 0
  for (const file of files) {
    const track = trackKeyFromFilename(file)
    if (!track) {
      console.warn(`[seed:cambridge-audio] skip unparseable name: ${file}`)
      continue
    }
    const fullPath = path.join(folder, file)
    const { url } = await uploadWithRetry(fullPath, track)
    audio_urls[track] = url
    uploaded += 1
    console.log(`[seed:cambridge-audio] ${track} ← ${file}`)
  }

  await CurriculumBook.updateOne(
    { _id: BOOK_ID },
    { $set: { "data.audio_urls": audio_urls } },
  )
  invalidateBookCache(BOOK_ID)

  const keys = Object.keys(audio_urls).sort((a, b) => Number(a) - Number(b))
  console.log(
    `[seed:cambridge-audio] done — uploaded ${uploaded}, book now has ${keys.length} audio_urls (${keys[0]}…${keys[keys.length - 1]})`,
  )
}

const folderArg = process.argv.slice(2).find((a) => !a.startsWith("-"))
const folder =
  folderArg ||
  process.env.CAMBRIDGE_AUDIO_DIR ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "Downloads",
    "Telegram Desktop",
  )

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  await seedBookAudio(folder)
} finally {
  await mongoose.disconnect().catch(() => {})
}
