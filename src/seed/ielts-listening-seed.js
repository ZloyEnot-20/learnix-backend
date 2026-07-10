/**
 * Seeds IELTS Listening tests from mobile JSON + bundled full audio into MongoDB.
 *
 * Run with: npm run seed:listening
 */
import fs from "fs"
import path from "path"
import { setServers } from "node:dns"
import { fileURLToPath } from "url"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { IeltsListening } from "../models/IeltsListening.js"
import { uploadIeltsListeningAudio } from "../services/s3.service.js"
import {
  countListeningQuestions,
  normalizeListeningInput,
} from "../services/ieltsListening.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../../..")
const LISTENING_DATA_DIR = path.join(
  ROOT,
  "learnix-mobile/src/data/ielts-listening",
)
const LISTENING_ASSETS_DIR = path.join(ROOT, "learnix-mobile/assets/ielts-listening")

function loadCatalogItems() {
  const indexPath = path.join(LISTENING_DATA_DIR, "index.json")
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing index.json at ${indexPath}`)
  }
  return JSON.parse(fs.readFileSync(indexPath, "utf8"))
}

function catalogIdFromEntry(entry, data) {
  if (data.catalogId) return data.catalogId
  if (typeof data.book === "number" && typeof data.test === "number") {
    return `cambridge-ielts-${data.book}-listening-test-${data.test}`
  }
  return entry.file.replace(/\.json$/, "")
}

async function resolveFullAudioUrl(slug, skipAudio) {
  const audioPath = path.join(LISTENING_ASSETS_DIR, slug, "full.mp3")
  if (!fs.existsSync(audioPath)) {
    console.warn(`[seed:listening] missing audio for ${slug}: ${audioPath}`)
    return ""
  }
  if (skipAudio) {
    const existing = await IeltsListening.findById(slug).select("fullAudioUrl").lean()
    if (existing?.fullAudioUrl) return existing.fullAudioUrl
  }

  const buffer = fs.readFileSync(audioPath)
  const { url } = await uploadIeltsListeningAudio({
    buffer,
    slug,
    publicBaseUrl: process.env.PUBLIC_API_URL || `http://localhost:${env.port}`,
  })
  return url
}

async function seedListenings({ skipAudio = false } = {}) {
  const items = loadCatalogItems().filter((item) => item.status === "ok")
  let written = 0

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const filePath = path.join(LISTENING_DATA_DIR, item.file)
    if (!fs.existsSync(filePath)) {
      console.warn(`[seed:listening] skip missing file: ${item.file}`)
      continue
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
    const slug = catalogIdFromEntry(item, data)
    const fullAudioUrl = await resolveFullAudioUrl(slug, skipAudio)

    const normalized = normalizeListeningInput(
      {
        slug,
        title: data.title ?? `Cambridge IELTS ${item.book} Listening Test ${item.test}`,
        subtitle: `Book ${item.book} · Test ${item.test}`,
        book: item.book ?? data.book,
        test: item.test ?? data.test,
        totalTimeMinutes: data.totalTime ?? 30,
        questionCount: countListeningQuestions(data),
        fullAudioUrl,
        data: {
          ...data,
          catalogId: slug,
          fullAudioUrl,
        },
        order: idx,
      },
      idx,
    )

    await IeltsListening.updateOne(
      { _id: normalized.slug },
      {
        $set: {
          slug: normalized.slug,
          title: normalized.title,
          subtitle: normalized.subtitle ?? "",
          book: normalized.book,
          test: normalized.test,
          totalTimeMinutes: normalized.totalTimeMinutes,
          questionCount: normalized.questionCount,
          fullAudioUrl: normalized.fullAudioUrl,
          data: normalized.data,
          order: normalized.order,
        },
      },
      { upsert: true },
    )
    written += 1
    if ((idx + 1) % 10 === 0) {
      console.log(`[seed:listening] ${idx + 1}/${items.length} upserted`)
    }
  }

  console.log(`[seed:listening] upserted ${written} listening test(s)`)
}

const skipAudio = process.argv.includes("--skip-audio")

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  await seedListenings({ skipAudio })
} finally {
  await mongoose.disconnect().catch(() => {})
}
