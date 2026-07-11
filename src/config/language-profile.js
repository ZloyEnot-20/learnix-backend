/**
 * Language profile configuration — exercise → skill mapping, topic difficulty
 * weights, and mastery thresholds. Extensible for future reading/listening/writing.
 */

/** Skills currently measured by Learnix data. */
export const MEASURED_SKILLS = ["grammar", "vocabulary", "speaking", "reading", "listening"]

/** Skills reserved for future implementation (no score computed). */
export const FUTURE_SKILLS = ["writing"]

/** Grammar exercise types (GrammarExerciseType). */
export const GRAMMAR_EXERCISE_TYPES = new Set([
  "fill-in-the-blank",
  "multiple-choice",
  "matching",
  "word-formation",
  "sentence-transformation",
  "true-false",
  "error-correction",
  "word-order",
])

export const SPEAKING_EXERCISE_TYPES = new Set(["speaking"])

/** Minimum questions before topic contributes to skill score. */
export const MIN_QUESTIONS_FOR_TOPIC = 3

/**
 * Vocabulary WordAnswerEvent normalization.
 * One "tap" is less reliable than a full quiz question, so we count it as a fraction.
 */
export const WORD_EVENT_QUESTION_WEIGHT = 0.25

/** Vocabulary deck mastery requires this % of words mastered (by streak). */
export const VOCAB_DECK_MASTERY_PCT = 80

/** Mastery thresholds (spec §8–9). */
export const MASTERY_ACCURACY = 75
export const MASTERY_CONFIDENCE = 0.7
export const MASTERY_MIN_QUESTIONS = 15
export const NEEDS_REVIEW_ACCURACY = 60
export const NEEDS_REVIEW_STALE_DAYS = 180

/** Confidence: sqrt(totalQuestions / CONFIDENCE_FULL_AT). */
export const CONFIDENCE_FULL_AT = 30

/** Recency half-life in days (spec §6). */
export const RECENCY_HALF_LIFE_DAYS = 90

/** Learnix topic difficulty weight by internal level 1–9 (spec §11). */
export const TOPIC_LEVEL_WEIGHT = {
  1: 1.0,
  2: 1.2,
  3: 1.4,
  4: 1.6,
  5: 1.8,
  6: 2.0,
  7: 2.2,
  8: 2.4,
  9: 2.6,
}

/**
 * Grammar topic slug → Learnix level (1–9). Derived from CEFR ranges in catalogue.
 * Topics not listed default to level 5.
 */
export const GRAMMAR_TOPIC_LEVELS = {
  "verb-to-be": 1,
  "there-is-there-are": 1,
  "verb-to-have": 1,
  pronouns: 2,
  possessives: 2,
  "present-simple": 2,
  articles: 2,
  "ed-vs-ing-adjectives": 3,
  "present-continuous": 3,
  "past-simple": 3,
  comparatives: 3,
  "future-tenses": 3,
  quantifiers: 3,
  "containers-partitives": 4,
  "reflexive-pronouns": 4,
  "subject-verb-agreement": 4,
  "wh-question-words-and-question-order": 4,
  "time-expressions": 4,
  "adverb-vs-adjective": 4,
  "too-enough": 4,
  "past-continuous": 5,
  "modal-verbs": 5,
  prepositions: 5,
  "question-tags": 5,
  "word-order": 5,
  "present-perfect": 5,
  "used-to": 5,
  "adjective-order": 6,
  "ellipsis-substitution": 6,
  "confusing-verbs": 6,
  "gerunds-and-infinitives": 6,
  "relative-clauses": 6,
  "business-english": 6,
  "compound-words": 6,
  "would-rather": 6,
  "past-perfect": 7,
  "passive-voice": 7,
  "reported-speech": 7,
  conditionals: 7,
  "phrasal-verbs": 7,
  "adjective-preposition": 7,
  "noun-preposition": 7,
  causative: 7,
  "so-vs-such": 7,
  "wish-if-only": 8,
  "linking-words-and-connectors": 8,
  "prepositional-phrases": 8,
  "word-formation": 8,
  "participle-clauses": 8,
  "cleft-sentences": 8,
  inversion: 9,
  "whatever-whoever": 9,
}

/** Total grammar topics in catalogue (for coverage). */
export const GRAMMAR_TOPIC_COUNT = 52

/** Learnix level (1–9) → CEFR band shown in admin and student UI. */
export const LEARNIX_TO_CEFR = ["", "A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C2"]

/** Human-readable level metadata for admin level scale. */
export const LEARNIX_LEVEL_META = [
  {
    level: 1,
    cefr: "A1",
    title: "Starter",
    description: "Basic sentences, verb to be, there is/are, simple vocabulary.",
  },
  {
    level: 2,
    cefr: "A2",
    title: "Elementary",
    description: "Present simple, articles, pronouns, everyday topics and routines.",
  },
  {
    level: 3,
    cefr: "A2",
    title: "Pre-Intermediate",
    description: "Present continuous, past simple, comparatives, common time expressions.",
  },
  {
    level: 4,
    cefr: "B1",
    title: "Intermediate",
    description: "Question forms, agreement, containers, adverbs, intermediate vocabulary.",
  },
  {
    level: 5,
    cefr: "B1",
    title: "Upper-Intermediate",
    description: "Modals, present perfect, prepositions, past continuous, phrasal basics.",
  },
  {
    level: 6,
    cefr: "B2",
    title: "B2 Core",
    description: "Relative clauses, gerunds/infinitives, business English, compound words.",
  },
  {
    level: 7,
    cefr: "B2",
    title: "B2 Advanced",
    description: "Passive voice, conditionals, reported speech, phrasal verbs, causative.",
  },
  {
    level: 8,
    cefr: "C1",
    title: "C1",
    description: "Wish/if only, linking words, participle clauses, advanced word formation.",
  },
  {
    level: 9,
    cefr: "C2",
    title: "C2",
    description: "Inversion, advanced structures, near-native grammar control.",
  },
]

function formatTopicTitle(slug) {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Grammar topics grouped by Learnix level for admin level scale. */
export function buildGrammarLevelCatalogue() {
  const byLevel = Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      String(i + 1),
      { grammarTopics: [] },
    ]),
  )
  for (const [slug, level] of Object.entries(GRAMMAR_TOPIC_LEVELS)) {
    byLevel[String(level)].grammarTopics.push({
      slug,
      title: formatTopicTitle(slug),
    })
  }
  for (const level of Object.values(byLevel)) {
    level.grammarTopics.sort((a, b) => a.title.localeCompare(b.title))
  }
  return byLevel
}

/** Full level catalogue payload for API. */
export function buildLevelCatalogue() {
  const grammarByLevel = buildGrammarLevelCatalogue()
  return LEARNIX_LEVEL_META.map((meta) => ({
    ...meta,
    grammarTopics: grammarByLevel[String(meta.level)].grammarTopics,
    vocabularyCefr: meta.cefr,
  }))
}

/** CEFR deck level → Learnix topic level for vocabulary. */
export const CEFR_TO_TOPIC_LEVEL = {
  A1: 1,
  A2: 2,
  B1: 4,
  B2: 6,
  C1: 8,
  C2: 9,
}

export function topicLevelWeight(level) {
  return TOPIC_LEVEL_WEIGHT[level] ?? TOPIC_LEVEL_WEIGHT[5]
}

export function grammarTopicLevel(topicSlug) {
  return GRAMMAR_TOPIC_LEVELS[topicSlug] ?? 5
}

export function vocabDeckLevel(cefrLevel, difficulty = "medium") {
  const base = CEFR_TO_TOPIC_LEVEL[cefrLevel?.toUpperCase()] ?? 3
  if (difficulty === "easy") return Math.max(1, base - 1)
  if (difficulty === "hard") return Math.min(9, base + 1)
  return base
}

export function confidenceFromQuestions(totalQuestions) {
  if (!totalQuestions || totalQuestions <= 0) return 0
  return Math.min(1, Math.sqrt(totalQuestions / CONFIDENCE_FULL_AT))
}

/** Speaking confidence from teacher-graded assessments (not question count). */
export function speakingConfidenceFromAssessments(approvedCount) {
  if (!approvedCount || approvedCount <= 0) return 0
  return Math.min(1, approvedCount / 10)
}

export function recencyWeight(at, now = new Date()) {
  if (!at) return 1
  const days = Math.max(0, (now.getTime() - new Date(at).getTime()) / (1000 * 60 * 60 * 24))
  return Math.exp((-Math.LN2 * days) / RECENCY_HALF_LIFE_DAYS)
}

export function exerciseTypeToSkill(type, subject) {
  if (subject === "vocabulary") return "vocabulary"
  if (subject === "speaking") return "speaking"
  if (subject === "grammar") return "grammar"
  if (SPEAKING_EXERCISE_TYPES.has(type)) return "speaking"
  if (GRAMMAR_EXERCISE_TYPES.has(type)) return "grammar"
  return null
}
