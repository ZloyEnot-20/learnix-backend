const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"])
const DIFFICULTIES = new Set(["easy", "medium", "hard"])

export function slugifyPodcast(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Accept `word` or legacy `term`. */
export function normalizePodcastWord(raw) {
  const word = String(raw.word ?? raw.term ?? "").trim()
  if (!word) return null
  return {
    word,
    definition: String(raw.definition ?? raw.meaning ?? "").trim(),
  }
}

/** Parse optional words JSON — accepts an array or `{ words: [...] }`. */
export function parsePodcastWordsJson(raw) {
  if (raw == null || raw === "") return []
  let parsed = raw
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error("Invalid words JSON")
    }
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.words
  if (!Array.isArray(list)) {
    throw new Error("Words JSON must be an array or { words: [...] }")
  }
  const out = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const entry = normalizePodcastWord(item)
    if (entry) out.push(entry)
  }
  return out
}

export function validatePodcastMeta(body) {
  const title = String(body.title ?? "").trim()
  const topic = String(body.topic ?? "").trim()
  const level = String(body.level ?? "A1").trim().toUpperCase()
  const difficulty = String(body.difficulty ?? "easy").trim().toLowerCase()

  if (!title) throw new Error("title is required")
  if (!topic) throw new Error("topic is required")
  if (!CEFR_LEVELS.has(level)) throw new Error("level must be A1–C2")
  if (!DIFFICULTIES.has(difficulty)) throw new Error("difficulty must be easy, medium or hard")

  const slug =
    slugifyPodcast(body.slug) ||
    slugifyPodcast(title) ||
    slugifyPodcast(topic) ||
    `podcast-${Date.now()}`

  return {
    slug,
    title,
    topic,
    level,
    difficulty,
    description: String(body.description ?? "").trim(),
    durationMinutes: Number(body.durationMinutes) > 0 ? Number(body.durationMinutes) : 0,
  }
}

export function serializePodcast(doc) {
  const words = (doc.words ?? []).map((w) => ({
    word: w.word ?? w.term ?? "",
    definition: w.definition ?? "",
  }))
  return {
    slug: doc.slug,
    title: doc.title,
    topic: doc.topic ?? "",
    description: doc.description ?? "",
    level: doc.level ?? "A1",
    difficulty: doc.difficulty ?? "easy",
    audioUrl: doc.audioUrl,
    durationMinutes: doc.durationMinutes ?? 0,
    words,
  }
}
