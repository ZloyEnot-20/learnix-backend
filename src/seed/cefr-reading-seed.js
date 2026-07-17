/**
 * Seeds CEFR Reading tests from exercises/cefr/reading/*.json into MongoDB.
 *
 * Run with: npm run seed:cefr-reading
 */
import fs from "fs"
import path from "path"
import { setServers } from "node:dns"
import { fileURLToPath } from "url"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { IeltsReading } from "../models/IeltsReading.js"
import { countReadingQuestions, normalizeReadingInput } from "../services/ieltsReading.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const READING_DIR = path.resolve(__dirname, "../../../exercises/cefr/reading")

function loadCatalogItems() {
  const indexPath = path.join(READING_DIR, "index.json")
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing index.json at ${indexPath}`)
  }
  const { items } = JSON.parse(fs.readFileSync(indexPath, "utf8"))
  return items ?? []
}

async function seedCefrReadings() {
  const items = loadCatalogItems()
  let written = 0

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const filePath = path.join(READING_DIR, item.file)
    if (!fs.existsSync(filePath)) {
      console.warn(`[seed:cefr-reading] skip missing file: ${item.file}`)
      continue
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
    const normalized = normalizeReadingInput(
      {
        slug: item.id,
        title: item.title,
        level: item.level,
        totalTimeMinutes: item.estimatedMinutes ?? data.totalTimeMinutes,
        questionCount: item.questionCount,
        subtitle: item.subtitle,
        data,
        order: 1000 + idx,
      },
      idx,
    )

    await IeltsReading.updateOne(
      { _id: normalized.slug },
      {
        $set: {
          slug: normalized.slug,
          title: normalized.title,
          subtitle: normalized.subtitle ?? "",
          level: normalized.level ?? item.level ?? "",
          totalTimeMinutes: normalized.totalTimeMinutes,
          questionCount: normalized.questionCount ?? countReadingQuestions(normalized.data),
          questionTypes: normalized.questionTypes,
          data: normalized.data,
          order: normalized.order,
        },
      },
      { upsert: true },
    )
    written += 1
  }

  console.log(`[seed:cefr-reading] upserted ${written} reading test(s)`)
}

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  await seedCefrReadings()
} finally {
  await mongoose.disconnect().catch(() => {})
}
