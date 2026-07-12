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

const KNOWN_TYPES = new Set([
  "multiple-choice",
  "true-false-not-given",
  "yes-no-not-given",
  "matching-headings",
  "matching-information",
  "matching-features",
  "matching-sentence-endings",
  "sentence-completion",
  "summary-completion",
  "note-completion",
  "table-completion",
  "flow-chart-completion",
  "diagram-label-completion",
  "short-answer",
  "selecting-a-title",
  "summary-completion-word-box",
  "diagram-completion",
  "note-completion-word-box",
  "table-completion-word-box",
  "flow-chart-completion-word-box",
])

const COARSE_STORED = new Set([
  "multiple-choice",
  "fill-in-blank",
  "one_choice",
  "short-answer",
])

function hasWordBox(text) {
  return (
    /list of words/i.test(text) ||
    /box of words/i.test(text) ||
    /using the list of/i.test(text) ||
    /from the list of words/i.test(text) ||
    /choose (your answers )?from the (list|box)/i.test(text) ||
    /\b[a-k]\s*[-–]\s*[a-k]\b/i.test(text)
  )
}

export function classifyReadingCatalogType({
  instruction = "",
  questionInstruction = "",
  questionType = "",
  hasOptions = false,
  title = "",
} = {}) {
  const stored = String(questionType || "").trim()

  const text = [
    instruction,
    questionInstruction,
    title,
    COARSE_STORED.has(stored) ? "" : stored,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  const wordBox =
    hasWordBox(text) || Boolean(hasOptions && /summary|notes?|table|flow|diagram/i.test(text))

  if (/list of headings|correct heading|suitable heading|most suitable headings/i.test(text)) {
    return "matching-headings"
  }
  if (
    /which (paragraph|section)s? contains|contains the following information|which section contains/i.test(
      text,
    )
  ) {
    return "matching-information"
  }
  if (/correct ending|complete each sentence with the correct ending|ending,? a-/i.test(text)) {
    return "matching-sentence-endings"
  }
  if (
    /match each|list of (people|researchers|organisations|organizations|brands|statements)|classify the following|correct (person|academic|researcher)/i.test(
      text,
    )
  ) {
    return "matching-features"
  }
  if (
    /suitable title|most appropriate title|choose.*(a |the )?title for|best title for/i.test(text)
  ) {
    return "selecting-a-title"
  }

  if (
    /yes\s*\/?\s*no\s*\/?\s*not\s*given|agrees with the (claims|views)|claims of the writer|views of the writer|reflects the claims/i.test(
      text,
    )
  ) {
    return "yes-no-not-given"
  }
  if (
    /true\s*\/?\s*false\s*\/?\s*not\s*given|agrees with the information|contradicts the information/i.test(
      text,
    )
  ) {
    return "true-false-not-given"
  }

  if (/choose the correct letter/i.test(text) && !/ending|heading|paragraph contains/i.test(text)) {
    return "multiple-choice"
  }

  if (/answer the questions? below|short answer/i.test(text)) {
    return "short-answer"
  }

  if (/flow[\s-]?chart|flowchart/i.test(text)) {
    return wordBox ? "flow-chart-completion-word-box" : "flow-chart-completion"
  }
  if (/complete the labels on the diagram|diagram label|label(s)? on the diagram/i.test(text)) {
    return "diagram-label-completion"
  }
  if (/complete( the)? diagram|diagram below/i.test(text)) {
    return "diagram-completion"
  }
  if (/complete the summary|summary below/i.test(text)) {
    return wordBox ? "summary-completion-word-box" : "summary-completion"
  }
  if (/complete the notes|notes below/i.test(text)) {
    return wordBox ? "note-completion-word-box" : "note-completion"
  }
  if (/complete the table|table below/i.test(text)) {
    return wordBox ? "table-completion-word-box" : "table-completion"
  }
  if (/complete the sentences?|complete each sentence(?! with the correct ending)/i.test(text)) {
    return "sentence-completion"
  }

  if (KNOWN_TYPES.has(stored)) {
    if (
      (stored === "summary-completion" ||
        stored === "note-completion" ||
        stored === "table-completion" ||
        stored === "flow-chart-completion") &&
      (wordBox || hasOptions)
    ) {
      return `${stored}-word-box`
    }
    return stored
  }

  if (stored === "true_false_notgiven") return "true-false-not-given"
  if (stored === "yes_no_notgiven") return "yes-no-not-given"
  if (stored === "one_choice" || stored === "multiple-choice") return "multiple-choice"
  if (stored === "matching_sentence_endings") return "matching-sentence-endings"
  if (stored === "matching_headings") return "matching-headings"
  if (stored === "matching_information") return "matching-information"
  if (stored === "matching_features") return "matching-features"
  if (stored === "summary_completion") {
    return wordBox || hasOptions ? "summary-completion-word-box" : "summary-completion"
  }
  if (stored === "sentence_completion") return "sentence-completion"
  if (stored === "note_completion") {
    return wordBox || hasOptions ? "note-completion-word-box" : "note-completion"
  }
  if (stored === "table_completion") {
    return wordBox || hasOptions ? "table-completion-word-box" : "table-completion"
  }
  if (stored === "flow_chart_completion") {
    return wordBox || hasOptions ? "flow-chart-completion-word-box" : "flow-chart-completion"
  }
  if (stored === "diagram_labelling") return "diagram-label-completion"
  if (stored === "short-answer") return "short-answer"
  if (stored === "fill-in-blank") {
    return wordBox ? "summary-completion-word-box" : "sentence-completion"
  }

  return stored || "sentence-completion"
}

export function collectReadingQuestionTypes(data) {
  const types = new Set()
  for (const part of data?.parts ?? []) {
    if (part.sections?.length) {
      for (const section of part.sections) {
        types.add(
          classifyReadingCatalogType({
            instruction: section.instruction || part.instruction,
            questionInstruction: part.questionInstruction,
            questionType: section.questions?.[0]?.type,
            hasOptions: Boolean(section.options?.length),
            title: section.title,
          }),
        )
      }
      continue
    }
    if (part.questions?.length) {
      types.add(
        classifyReadingCatalogType({
          instruction: part.instruction,
          questionInstruction: part.questionInstruction,
          questionType: part.questions[0]?.type,
          hasOptions: part.questions.some((q) => Array.isArray(q?.options) && q.options.length > 0),
        }),
      )
    }
  }
  return [...types].sort()
}

export function serializeReadingSummary(doc) {
  const data = doc.data ?? {}
  const questionCount = doc.questionCount ?? countReadingQuestions(data)
  // Always recompute so catalogue filters stay correct after classifier updates
  // even if stored questionTypes are stale.
  const questionTypes = collectReadingQuestionTypes(data)
  return {
    slug: doc.slug,
    title: doc.title,
    subtitle: doc.subtitle || `${questionCount} questions`,
    totalTimeMinutes: doc.totalTimeMinutes ?? data.totalTimeMinutes ?? 20,
    questionCount,
    questionTypes,
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
  const questionTypes = collectReadingQuestionTypes(data)
  return {
    slug,
    title: raw.title ?? data.title ?? slug,
    subtitle: raw.subtitle ?? "",
    totalTimeMinutes: raw.totalTimeMinutes ?? data.totalTimeMinutes ?? 20,
    questionCount,
    questionTypes,
    data: {
      id: data.id ?? slug,
      title: data.title ?? raw.title ?? slug,
      totalTimeMinutes: data.totalTimeMinutes ?? raw.totalTimeMinutes ?? 20,
      parts: data.parts ?? [],
    },
    order: raw.order ?? idx,
  }
}
