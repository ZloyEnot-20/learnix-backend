/**
 * Import CEFR reading tests (A1/A2/B1) from JSON bundles into exercises/cefr/reading
 * and upsert them into MongoDB with a level tag.
 *
 * Usage:
 *   node src/scripts/import-cefr-reading.mjs
 *   node src/scripts/import-cefr-reading.mjs D:/tests/reading/A1.json A1
 */
import fs from "fs"
import path from "path"
import { setServers } from "node:dns"
import { fileURLToPath } from "url"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { IeltsReading } from "../models/IeltsReading.js"
import {
  countReadingQuestions,
  normalizeReadingInput,
} from "../services/ieltsReading.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, "../../../exercises/cefr/reading")
const DEFAULT_SOURCES = [
  { file: "D:/tests/reading/A1.json", level: "A1" },
  { file: "D:/tests/reading/A2.json", level: "A2" },
  { file: "D:/tests/reading/B1.json", level: "B1" },
]

function flattenTests(raw) {
  if (!Array.isArray(raw)) return []
  if (raw.length === 0) return []
  if (Array.isArray(raw[0])) return raw.flat()
  return raw
}

function countQuestionsInTest(data) {
  return countReadingQuestions(data)
}

function loadSources(argv) {
  if (argv.length >= 2) {
    return [{ file: path.resolve(argv[0]), level: String(argv[1]).toUpperCase() }]
  }
  return DEFAULT_SOURCES
}

async function main() {
  const sources = loadSources(process.argv.slice(2))
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const catalogItems = []
  let order = 0

  for (const { file, level } of sources) {
    if (!fs.existsSync(file)) {
      console.warn(`[cefr-reading] skip missing: ${file}`)
      continue
    }
    const tests = flattenTests(JSON.parse(fs.readFileSync(file, "utf8")))
    for (const test of tests) {
      const slug = String(test.id ?? "").trim()
      if (!slug) continue
      const outFile = `${slug}.json`
      const outPath = path.join(OUT_DIR, outFile)
      fs.writeFileSync(outPath, `${JSON.stringify(test, null, 2)}\n`, "utf8")

      const questionCount = test.parts?.[0]?.totalQuestions ?? countQuestionsInTest(test)
      catalogItems.push({
        id: slug,
        title: test.title ?? slug,
        subtitle: test.subtitle ?? "",
        level,
        estimatedMinutes: test.totalTimeMinutes ?? 15,
        questionCount,
        file: outFile,
      })
      order += 1
    }
    console.log(`[cefr-reading] staged ${tests.length} test(s) from ${path.basename(file)} (${level})`)
  }

  const indexPath = path.join(OUT_DIR, "index.json")
  const existingIndex = fs.existsSync(indexPath)
    ? JSON.parse(fs.readFileSync(indexPath, "utf8"))
    : { items: [] }
  const byId = new Map((existingIndex.items ?? []).map((item) => [item.id, item]))
  for (const item of catalogItems) byId.set(item.id, item)
  const mergedItems = [...byId.values()].sort((a, b) => {
    const levelOrder = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 }
    const la = levelOrder[a.level] ?? 99
    const lb = levelOrder[b.level] ?? 99
    if (la !== lb) return la - lb
    return String(a.id).localeCompare(String(b.id))
  })
  fs.writeFileSync(indexPath, `${JSON.stringify({ items: mergedItems }, null, 2)}\n`, "utf8")
  const frontIndexPath = path.resolve(__dirname, "../../../learnix-front/lib/data/cefr-reading-index.json")
  fs.mkdirSync(path.dirname(frontIndexPath), { recursive: true })
  fs.writeFileSync(frontIndexPath, `${JSON.stringify({ items: mergedItems }, null, 2)}\n`, "utf8")
  console.log(`[cefr-reading] wrote index with ${mergedItems.length} item(s)`)

  await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
  try {
    let written = 0
    for (let idx = 0; idx < mergedItems.length; idx++) {
      const item = mergedItems[idx]
      const filePath = path.join(OUT_DIR, item.file)
      if (!fs.existsSync(filePath)) continue
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
      const normalized = normalizeReadingInput(
        {
          slug: item.id,
          title: item.title,
          subtitle: item.subtitle,
          level: item.level,
          totalTimeMinutes: item.estimatedMinutes ?? data.totalTimeMinutes,
          questionCount: item.questionCount,
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
            level: normalized.level ?? "",
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
    console.log(`[cefr-reading] upserted ${written} reading test(s) in MongoDB`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
