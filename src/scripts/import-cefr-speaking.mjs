/**
 * Import CEFR speaking tests (A1–C1) from JSON bundles into exercises/cefr/speaking
 * and upsert them into MongoDB — one topic folder per CEFR level.
 *
 * Usage:
 *   node src/scripts/import-cefr-speaking.mjs
 *   node src/scripts/import-cefr-speaking.mjs D:/tests/speaking/A1.json A1
 */
import fs from "fs"
import path from "path"
import { setServers } from "node:dns"
import { fileURLToPath } from "url"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"
import {
  buildSpeakingTopicMeta,
  countSpeakingQuestions,
  normalizeSpeakingExerciseInput,
} from "../services/cefrSpeaking.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, "../../../exercises/cefr/speaking")
const DEFAULT_SOURCES = [
  { file: "D:/tests/speaking/A1.json", level: "A1" },
  { file: "D:/tests/speaking/A2.json", level: "A2" },
  { file: "D:/tests/speaking/B1.json", level: "B1" },
  { file: "D:/tests/speaking/B2.json", level: "B2" },
  { file: "D:/tests/speaking/C1.json", level: "C1" },
]

function flattenTests(raw) {
  if (!Array.isArray(raw)) return []
  if (raw.length === 0) return []
  if (Array.isArray(raw[0])) return raw.flat()
  return raw
}

function loadSources(argv) {
  if (argv.length >= 2) {
    return [{ file: path.resolve(argv[0]), level: String(argv[1]).toUpperCase() }]
  }
  return DEFAULT_SOURCES
}

async function upsertExercise(normalized) {
  const ex = normalized.exercise
  await Exercise.updateOne(
    { _id: ex.slug },
    {
      $set: {
        slug: ex.slug,
        title: ex.title,
        category: ex.category,
        topic: ex.topic,
        subtopic: ex.subtopic,
        type: ex.type,
        level: ex.level,
        difficulty: ex.difficulty,
        estimatedTime: ex.estimatedTime,
        totalQuestions: ex.totalQuestions,
        data: ex,
      },
    },
    { upsert: true },
  )
}

async function refreshTopicMeta(level, importedExercises) {
  const allForLevel = await Exercise.find({
    category: "speaking",
    level,
    orgId: null,
  }).lean()

  const merged = new Map()
  for (const doc of allForLevel) {
    merged.set(doc.slug, {
      questionCount: doc.totalQuestions ?? 0,
      estimatedTime: doc.estimatedTime ?? 0,
    })
  }
  for (const item of importedExercises) {
    merged.set(item.slug, {
      questionCount: item.questionCount,
      estimatedTime: item.estimatedTime,
    })
  }

  const exercises = [...merged.entries()].map(([slug, stats]) => ({
    slug,
    ...stats,
  }))
  const topicMeta = buildSpeakingTopicMeta(level, exercises)

  await Topic.updateOne(
    { _id: topicMeta.slug },
    {
      $set: {
        slug: topicMeta.slug,
        title: topicMeta.title,
        description: topicMeta.description,
        levels: topicMeta.levels,
        exerciseCount: topicMeta.exerciseCount,
        questionCount: topicMeta.questionCount,
        totalMinutes: topicMeta.totalMinutes,
        order: topicMeta.order,
      },
    },
    { upsert: true },
  )
}

async function main() {
  const sources = loadSources(process.argv.slice(2))
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const catalogItems = []
  const normalizedByLevel = new Map()

  for (const { file, level } of sources) {
    if (!fs.existsSync(file)) {
      console.warn(`[cefr-speaking] skip missing: ${file}`)
      continue
    }

    const tests = flattenTests(JSON.parse(fs.readFileSync(file, "utf8")))
    const levelItems = []

    for (const test of tests) {
      const slug = String(test.id ?? "").trim()
      if (!slug) continue

      const outFile = `${slug}.json`
      const outPath = path.join(OUT_DIR, outFile)
      fs.writeFileSync(outPath, `${JSON.stringify(test, null, 2)}\n`, "utf8")

      const questionCount = countSpeakingQuestions(test)
      const item = {
        id: slug,
        title: test.title ?? slug,
        subtitle: test.subtitle ?? "",
        level,
        estimatedMinutes: test.totalTimeMinutes ?? 10,
        questionCount,
        file: outFile,
      }
      catalogItems.push(item)
      levelItems.push(item)
    }

    normalizedByLevel.set(level, levelItems)
    console.log(`[cefr-speaking] staged ${tests.length} test(s) from ${path.basename(file)} (${level})`)
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
  console.log(`[cefr-speaking] wrote index with ${mergedItems.length} item(s)`)

  await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
  try {
    let written = 0
    const touchedLevels = new Set()

    for (let idx = 0; idx < mergedItems.length; idx++) {
      const item = mergedItems[idx]
      const filePath = path.join(OUT_DIR, item.file)
      if (!fs.existsSync(filePath)) continue

      const test = JSON.parse(fs.readFileSync(filePath, "utf8"))
      const normalized = normalizeSpeakingExerciseInput(item, test, idx)
      await upsertExercise(normalized)
      touchedLevels.add(item.level)
      written += 1
    }

    for (const level of touchedLevels) {
      const imported = (normalizedByLevel.get(level) ?? []).map((item) => {
        const testPath = path.join(OUT_DIR, item.file)
        const test = JSON.parse(fs.readFileSync(testPath, "utf8"))
        return normalizeSpeakingExerciseInput(item, test)
      })
      await refreshTopicMeta(level, imported)
    }

    console.log(`[cefr-speaking] upserted ${written} speaking test(s) in MongoDB`)
    console.log(`[cefr-speaking] updated topic folders: ${[...touchedLevels].sort().join(", ")}`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
