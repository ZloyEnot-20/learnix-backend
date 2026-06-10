import "../config/mongoose.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"
import { buildSpeakingCatalog } from "../content/speaking-exercises.js"

async function seedSpeaking() {
  await connectDB()
  const { topics, exercises } = buildSpeakingCatalog()

  if (topics.length > 0) {
    const topicOps = topics.map((t, idx) => ({
      updateOne: {
        filter: { _id: t.slug },
        update: {
          $set: {
            slug: t.slug,
            title: t.title,
            description: t.description ?? "",
            levels: t.levels ?? "",
            exerciseCount: t.exerciseCount ?? 0,
            questionCount: t.questionCount ?? 0,
            totalMinutes: t.totalMinutes ?? 0,
            color: t.color ?? "",
            order: t.order ?? idx,
          },
        },
        upsert: true,
      },
    }))
    const topicResult = await Topic.bulkWrite(topicOps, { ordered: false })
    console.log(
      `[seed:speaking] topics upserted: ${(topicResult.upsertedCount ?? 0) + (topicResult.modifiedCount ?? 0)}`,
    )
  }

  if (exercises.length > 0) {
    const exerciseOps = exercises.map((ex) => {
      const data = { ...ex, slug: ex.slug, id: ex.id ?? ex.slug }
      return {
        updateOne: {
          filter: { _id: ex.slug },
          update: {
            $set: {
              slug: ex.slug,
              title: ex.title,
              category: ex.category ?? "speaking",
              topic: ex.topic,
              subtopic: ex.subtopic ?? "",
              type: ex.type,
              level: ex.level ?? "",
              difficulty: ex.difficulty ?? "easy",
              estimatedTime: ex.estimatedTime ?? 0,
              totalQuestions: ex.totalQuestions ?? 0,
              data,
            },
          },
          upsert: true,
        },
      }
    })
    const exResult = await Exercise.bulkWrite(exerciseOps, { ordered: false })
    console.log(
      `[seed:speaking] exercises upserted: ${(exResult.upsertedCount ?? 0) + (exResult.modifiedCount ?? 0)}`,
    )
  }

  console.log(`[seed:speaking] done — ${exercises.length} exercises, ${topics.length} topics`)
  await disconnectDB()
}

seedSpeaking().catch((err) => {
  console.error("[seed:speaking] failed:", err)
  process.exit(1)
})
