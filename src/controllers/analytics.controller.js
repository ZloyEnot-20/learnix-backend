import { ExerciseEvent } from "../models/ExerciseEvent.js"
import { asyncHandler } from "../utils/asyncHandler.js"

function pct(correct, total) {
  return total > 0 ? Math.round((correct / total) * 100) : 0
}

/** Record one finished grammar-exercise attempt. */
export const recordEvent = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const event = await ExerciseEvent.create({ ...req.body, studentId })
  res.status(201).json({ id: event._id })
})

/** Aggregate events into a topic → subtopic → exercise tree. */
export const topicStats = asyncHandler(async (req, res) => {
  const filter = {}
  // Students only see their own analytics; staff see everything.
  if (req.user.role === "student") {
    filter.studentId = req.user.id
  } else if (req.query.studentId) {
    filter.studentId = req.query.studentId
  }

  const events = await ExerciseEvent.find(filter)
  const byTopic = new Map()
  for (const e of events) {
    const arr = byTopic.get(e.topic) ?? []
    arr.push(e)
    byTopic.set(e.topic, arr)
  }

  const topics = []
  for (const [topic, topicEvents] of byTopic) {
    const bySub = new Map()
    for (const e of topicEvents) {
      const key = e.subtopic ?? "general"
      const arr = bySub.get(key) ?? []
      arr.push(e)
      bySub.set(key, arr)
    }

    const subtopics = []
    for (const [subtopic, subEvents] of bySub) {
      const byEx = new Map()
      for (const e of subEvents) {
        const arr = byEx.get(e.slug) ?? []
        arr.push(e)
        byEx.set(e.slug, arr)
      }
      const exercises = []
      for (const [slug, exEvents] of byEx) {
        const totalCorrect = exEvents.reduce((a, e) => a + e.correctCount, 0)
        const totalQuestions = exEvents.reduce((a, e) => a + e.totalQuestions, 0)
        exercises.push({
          slug,
          title: exEvents[0].title,
          topic,
          subtopic: exEvents[0].subtopic,
          type: exEvents[0].type,
          attempts: exEvents.length,
          totalCorrect,
          totalQuestions,
          timeouts: exEvents.filter((e) => e.timedOut).length,
          accuracy: pct(totalCorrect, totalQuestions),
        })
      }
      const subCorrect = subEvents.reduce((a, e) => a + e.correctCount, 0)
      const subTotal = subEvents.reduce((a, e) => a + e.totalQuestions, 0)
      subtopics.push({
        subtopic,
        attempts: subEvents.length,
        accuracy: pct(subCorrect, subTotal),
        exercises: exercises.sort((a, b) => a.accuracy - b.accuracy),
      })
    }

    const topicCorrect = topicEvents.reduce((a, e) => a + e.correctCount, 0)
    const topicTotal = topicEvents.reduce((a, e) => a + e.totalQuestions, 0)
    topics.push({
      topic,
      attempts: topicEvents.length,
      accuracy: pct(topicCorrect, topicTotal),
      timeouts: topicEvents.filter((e) => e.timedOut).length,
      subtopics: subtopics.sort((a, b) => a.accuracy - b.accuracy),
    })
  }

  res.json(topics.sort((a, b) => a.accuracy - b.accuracy))
})
