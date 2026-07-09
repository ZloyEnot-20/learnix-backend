/**
 * Backfill Submission topic fields and compute StudentLanguageProfile for all students.
 *
 * Usage:
 *   node scripts/migrate-student-language-profile.js
 *   node scripts/migrate-student-language-profile.js --submissions-only
 *   node scripts/migrate-student-language-profile.js --profiles-only
 */
import { setServers } from "node:dns"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { Submission } from "../src/models/Submission.js"
import { Homework } from "../src/models/Homework.js"
import { Exercise } from "../src/models/Exercise.js"
import { VocabDeck } from "../src/models/VocabDeck.js"
import {
  resolveSubmissionTopicFields,
  applySubmissionTopicFields,
} from "../src/services/submissionTopic.service.js"
import { recomputeStudentLanguageProfileBatch } from "../src/services/languageProfileQueue.js"

setServers(["8.8.8.8", "1.1.1.1"])

const BATCH_SIZE = 50
const args = new Set(process.argv.slice(2))
const submissionsOnly = args.has("--submissions-only")
const profilesOnly = args.has("--profiles-only")

async function backfillSubmissions() {
  const [subs, homeworks, exercises, decks] = await Promise.all([
    Submission.find({
      subject: { $in: ["grammar", "vocabulary", "speaking"] },
    }).lean(),
    Homework.find({ subject: { $in: ["grammar", "vocabulary", "speaking"] } })
      .select("_id exerciseSlug subject")
      .lean(),
    Exercise.find().select("slug topic level").lean(),
    VocabDeck.find().select("slug level difficulty").lean(),
  ])

  const hwById = new Map(homeworks.map((h) => [h._id, h]))
  const exerciseMap = new Map(exercises.map((e) => [e.slug, e]))
  const deckMap = new Map(decks.map((d) => [d.slug, d]))

  let updated = 0
  for (const sub of subs) {
    const hw = hwById.get(sub.homeworkId)
    if (!hw) continue
    if (sub.grammarTopic && sub.vocabularyTopic) continue

    const cached = {
      exercise: exerciseMap.get(hw.exerciseSlug),
      deck: deckMap.get(
        hw.exerciseSlug?.startsWith("vocab:")
          ? hw.exerciseSlug.slice(6)
          : hw.exerciseSlug,
      ),
    }
    const fields = await resolveSubmissionTopicFields(hw, cached)
    const needsUpdate =
      (fields.grammarTopic && sub.grammarTopic !== fields.grammarTopic) ||
      (fields.vocabularyTopic && sub.vocabularyTopic !== fields.vocabularyTopic) ||
      (fields.grammarLevel && sub.grammarLevel !== fields.grammarLevel) ||
      (fields.vocabularyLevel && sub.vocabularyLevel !== fields.vocabularyLevel)

    if (!needsUpdate) continue

    await Submission.updateOne(
      { _id: sub._id },
      {
        $set: {
          ...(fields.grammarTopic ? { grammarTopic: fields.grammarTopic } : {}),
          ...(fields.vocabularyTopic ? { vocabularyTopic: fields.vocabularyTopic } : {}),
          ...(fields.grammarLevel ? { grammarLevel: fields.grammarLevel } : {}),
          ...(fields.vocabularyLevel ? { vocabularyLevel: fields.vocabularyLevel } : {}),
        },
      },
    )
    updated += 1
  }

  console.log(`Backfilled topic fields on ${updated} submissions`)
}

async function backfillProfiles() {
  const users = mongoose.connection.collection("users")
  const cursor = users.find({ type: "student" }, { projection: { _id: 1 } })

  let processed = 0
  let batch = []

  for await (const doc of cursor) {
    batch.push(doc._id)
    if (batch.length >= BATCH_SIZE) {
      await recomputeStudentLanguageProfileBatch(batch)
      processed += batch.length
      console.log(`Computed profiles for ${processed} students…`)
      batch = []
    }
  }

  if (batch.length) {
    await recomputeStudentLanguageProfileBatch(batch)
    processed += batch.length
  }

  console.log(`Done — ${processed} student language profiles computed`)
}

async function main() {
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    dbName: env.dbName,
  })

  if (!profilesOnly) {
    await backfillSubmissions()
  }
  if (!submissionsOnly) {
    await backfillProfiles()
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
