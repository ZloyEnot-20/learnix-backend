export function slugifyListening(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

export function countListeningQuestions(data) {
  const ids = new Set()
  for (const part of data?.parts ?? []) {
    for (const question of part.questions ?? []) {
      if (question?.id != null && Number(question.id) <= 40) {
        ids.add(Number(question.id))
      }
    }
  }
  return ids.size
}

export function serializeListeningSummary(doc) {
  const data = doc.data ?? {}
  const questionCount = doc.questionCount ?? countListeningQuestions(data)
  return {
    slug: doc.slug,
    title: doc.title,
    subtitle: doc.subtitle || `Book ${doc.book ?? "?"} · Test ${doc.test ?? "?"}`,
    book: doc.book,
    test: doc.test,
    totalTimeMinutes: doc.totalTimeMinutes ?? data.totalTime ?? 30,
    questionCount,
    order: doc.order ?? 0,
  }
}

export function serializeListening(doc) {
  const data = doc.data ?? {}
  const fullAudioUrl = doc.fullAudioUrl || data.fullAudioUrl || ""
  return {
    slug: doc.slug,
    title: doc.title,
    book: doc.book,
    test: doc.test,
    totalTimeMinutes: doc.totalTimeMinutes ?? data.totalTime ?? 30,
    questionCount: doc.questionCount ?? countListeningQuestions(data),
    fullAudioUrl,
    data: {
      testId: data.testId ?? doc.slug,
      title: data.title ?? doc.title,
      book: data.book ?? doc.book,
      test: data.test ?? doc.test,
      catalogId: data.catalogId ?? doc.slug,
      totalTime: data.totalTime ?? doc.totalTimeMinutes ?? 30,
      fullAudioUrl,
      parts: data.parts ?? [],
      questionDetails: data.questionDetails ?? [],
      transcripts: data.transcripts,
    },
    order: doc.order ?? 0,
  }
}

export function normalizeListeningInput(raw, idx = 0) {
  const data = raw.data ?? raw
  const slug =
    slugifyListening(raw.slug || data.catalogId || data.testId || raw.title) ||
    `listening-${idx}`
  const questionCount = raw.questionCount ?? countListeningQuestions(data)
  const fullAudioUrl = raw.fullAudioUrl || data.fullAudioUrl || ""
  return {
    slug,
    title: raw.title ?? data.title ?? slug,
    subtitle: raw.subtitle ?? "",
    book: raw.book ?? data.book,
    test: raw.test ?? data.test,
    totalTimeMinutes: raw.totalTimeMinutes ?? data.totalTime ?? 30,
    questionCount,
    fullAudioUrl,
    data: {
      ...data,
      testId: data.testId ?? slug,
      title: data.title ?? raw.title ?? slug,
      catalogId: data.catalogId ?? slug,
      totalTime: data.totalTime ?? raw.totalTimeMinutes ?? 30,
      fullAudioUrl,
      parts: data.parts ?? [],
      questionDetails: data.questionDetails ?? [],
    },
    order: raw.order ?? idx,
  }
}
