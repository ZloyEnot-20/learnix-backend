export function slugifyReading(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

export function countReadingQuestions(data) {
  if (!data?.parts?.length) return 0
  return data.parts.reduce((sum, part) => sum + (part.questions?.length ?? 0), 0)
}

export function serializeReadingSummary(doc) {
  const data = doc.data ?? {}
  const questionCount = doc.questionCount ?? countReadingQuestions(data)
  return {
    slug: doc.slug,
    title: doc.title,
    subtitle: doc.subtitle || `${questionCount} questions`,
    totalTimeMinutes: doc.totalTimeMinutes ?? data.totalTimeMinutes ?? 20,
    questionCount,
    order: doc.order ?? 0,
  }
}

export function serializeReading(doc) {
  const data = doc.data ?? {}
  return {
    slug: doc.slug,
    title: doc.title,
    totalTimeMinutes: doc.totalTimeMinutes ?? data.totalTimeMinutes ?? 20,
    questionCount: doc.questionCount ?? countReadingQuestions(data),
    data: {
      id: data.id ?? doc.slug,
      title: data.title ?? doc.title,
      totalTimeMinutes: data.totalTimeMinutes ?? doc.totalTimeMinutes ?? 20,
      parts: data.parts ?? [],
    },
    order: doc.order ?? 0,
  }
}

export function normalizeReadingInput(raw, idx = 0) {
  const data = raw.data ?? raw
  const slug = slugifyReading(raw.slug || data.id || raw.title) || `reading-${idx}`
  const questionCount = raw.questionCount ?? countReadingQuestions(data)
  return {
    slug,
    title: raw.title ?? data.title ?? slug,
    subtitle: raw.subtitle ?? "",
    totalTimeMinutes: raw.totalTimeMinutes ?? data.totalTimeMinutes ?? 20,
    questionCount,
    data: {
      id: data.id ?? slug,
      title: data.title ?? raw.title ?? slug,
      totalTimeMinutes: data.totalTimeMinutes ?? raw.totalTimeMinutes ?? 20,
      parts: data.parts ?? [],
    },
    order: raw.order ?? idx,
    subtitle: raw.subtitle,
  }
}
