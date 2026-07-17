const LEVEL_META = {
  A1: { difficulty: "easy", estimatedTime: 10, prepTime: 15, speakTime: 30 },
  A2: { difficulty: "easy", estimatedTime: 10, prepTime: 20, speakTime: 45 },
  B1: { difficulty: "medium", estimatedTime: 12, prepTime: 30, speakTime: 60 },
  B2: { difficulty: "medium", estimatedTime: 15, prepTime: 45, speakTime: 90 },
  C1: { difficulty: "hard", estimatedTime: 18, prepTime: 60, speakTime: 120 },
  C2: { difficulty: "hard", estimatedTime: 20, prepTime: 60, speakTime: 150 },
}

export function speakingTopicSlug(level) {
  return `speaking-${String(level).toLowerCase()}`
}

export function extractSpeakingQuestions(test, level) {
  const meta = LEVEL_META[level] ?? LEVEL_META.A1
  const questions = []

  for (const part of test.parts ?? []) {
    for (const section of part.sections ?? []) {
      for (const q of section.questions ?? []) {
        questions.push({
          id: q.id,
          type: "speaking",
          text: String(q.question ?? q.text ?? "").trim(),
          explanation: String(q.explanation ?? section.instruction ?? part.instruction ?? "").trim(),
          hint: String(q.hint ?? section.instruction ?? part.instruction ?? "").trim() || undefined,
          prepTimeSeconds: q.prepTimeSeconds ?? meta.prepTime,
          speakTimeSeconds: q.speakTimeSeconds ?? meta.speakTime,
        })
      }
    }
    for (const q of part.questions ?? []) {
      questions.push({
        id: q.id,
        type: "speaking",
        text: String(q.question ?? q.text ?? "").trim(),
        explanation: String(q.explanation ?? part.instruction ?? "").trim(),
        hint: String(q.hint ?? part.instruction ?? "").trim() || undefined,
        prepTimeSeconds: q.prepTimeSeconds ?? meta.prepTime,
        speakTimeSeconds: q.speakTimeSeconds ?? meta.speakTime,
      })
    }
  }

  return questions
}

export function countSpeakingQuestions(test) {
  return extractSpeakingQuestions(test).length
}

export function normalizeSpeakingExerciseInput(item, test, order = 0) {
  const level = String(item.level ?? "").toUpperCase()
  const meta = LEVEL_META[level] ?? LEVEL_META.A1
  const slug = String(item.id ?? test.id ?? "").trim()
  const questions = extractSpeakingQuestions(test, level)
  const topic = speakingTopicSlug(level)
  const estimatedTime = item.estimatedMinutes ?? test.totalTimeMinutes ?? meta.estimatedTime

  const exercise = {
    id: slug,
    slug,
    title: item.title ?? test.title ?? slug,
    description: item.subtitle ?? test.subtitle ?? `${questions.length} speaking questions`,
    category: "speaking",
    topic,
    subtopic: "cefr-test",
    difficulty: meta.difficulty,
    level,
    type: "speaking",
    estimatedTime,
    totalQuestions: item.questionCount ?? questions.length,
    passingScore: item.questionCount ?? questions.length,
    tags: ["speaking", level, "CEFR"],
    instructions:
      "Read each question, prepare your answer, then tap Record. You can pause, listen to your recording, and re-record before submitting.",
    tips: [
      "Speak clearly and at a natural pace.",
      "Use the preparation time to organise your ideas.",
      "Listen to your recording before submitting.",
    ],
    content: { questions },
  }

  return {
    slug,
    topic,
    level,
    order,
    exercise,
    questionCount: questions.length,
    estimatedTime,
  }
}

export function buildSpeakingTopicMeta(level, exercises) {
  const topicSlug = speakingTopicSlug(level)
  const questionCount = exercises.reduce((sum, ex) => sum + ex.questionCount, 0)
  const totalMinutes = exercises.reduce((sum, ex) => sum + ex.estimatedTime, 0)
  const levelOrder = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 }

  return {
    slug: topicSlug,
    title: `Speaking — ${level}`,
    description: `${exercises.length} CEFR speaking test${exercises.length === 1 ? "" : "s"} at ${level} level. Record your answers and submit for review.`,
    levels: level,
    exerciseCount: exercises.length,
    questionCount,
    totalMinutes,
    order: 100 + (levelOrder[level] ?? 99),
  }
}
