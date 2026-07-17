/**
 * Seeds CEFR Speaking tests from exercises/cefr/speaking/*.json into MongoDB.
 *
 * Run with: npm run seed:cefr-speaking
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
  normalizeSpeakingExerciseInput,
} from "../services/cefrSpeaking.service.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SPEAKING_DIR = path.resolve(__dirname, "../../../exercises/cefr/speaking")

function loadCatalogItems() {
  const indexPath = path.join(SPEAKING_DIR, "index.json")
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing index.json at ${indexPath}`)
  }
  const { items } = JSON.parse(fs.readFileSync(indexPath, "utf8"))
  return items ?? []
}

async function refreshTopicMeta(level) {
  const allForLevel = await Exercise.find({
    category: "speaking",
    level,
    orgId: null,
  }).lean()

  const exercises = allForLevel.map((doc) => ({
    slug: doc.slug,
    questionCount: doc.totalQuestions ?? 0,
    estimatedTime: doc.estimatedTime ?? 0,
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

async function seedCefrSpeaking() {
  const items = loadCatalogItems()
  let written = 0
  const touchedLevels = new Set()

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const filePath = path.join(SPEAKING_DIR, item.file)
    if (!fs.existsSync(filePath)) {
      console.warn(`[seed:cefr-speaking] skip missing file: ${item.file}`)
      continue
    }

    const test = JSON.parse(fs.readFileSync(filePath, "utf8"))
    const normalized = normalizeSpeakingExerciseInput(item, test, idx)
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

    touchedLevels.add(item.level)
    written += 1
  }

  for (const level of touchedLevels) {
    await refreshTopicMeta(level)
  }

  console.log(`[seed:cefr-speaking] upserted ${written} speaking test(s)`)
}

await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))
try {
  await seedCefrSpeaking()
} finally {
  await mongoose.disconnect().catch(() => {})
}
