/**
 * IELTS Language Profile — topic catalogue, CEFR weights, band progression rules.
 * Model: Topic Mastery → CEFR Progress → IELTS Estimation
 */

/** CEFR level weights for IELTS estimation (spec). */
export const CEFR_LEVEL_WEIGHTS = {
  A1: 0.5,
  A2: 1,
  B1: 2,
  B2: 4,
  C1: 6,
  C2: 3,
}

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

/** IELTS band range per CEFR level (reference). */
export const CEFR_IELTS_RANGE = {
  A1: { min: 4.0, max: 4.5 },
  A2: { min: 4.5, max: 5.5 },
  B1: { min: 5.5, max: 6.0 },
  B2: { min: 6.0, max: 7.0 },
  C1: { min: 7.0, max: 8.0 },
  C2: { min: 8.0, max: 9.0 },
}

/**
 * Grammar topics — slug maps to existing Exercise.topic values.
 * minBand / ceilingBand: IELTS range this topic confirms when mastered.
 */
export const GRAMMAR_TOPIC_CATALOGUE = [
  // A1 — IELTS 4.0–4.5
  { id: "verb-to-be", name: "To Be", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "there-is-there-are", name: "There Is / There Are", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "present-simple", name: "Present Simple", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "present-continuous", name: "Present Continuous", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "modal-verbs", name: "Can / Can't", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar", aliases: ["can-cant"] },
  { id: "verb-to-have", name: "Have Got", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "articles", name: "Articles", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "prepositions", name: "Prepositions of Place", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "possessives", name: "Possessives", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },
  { id: "wh-question-words-and-question-order", name: "Basic Questions", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "grammar" },

  // A2 — IELTS 4.5–5.5
  { id: "past-simple", name: "Past Simple", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar" },
  { id: "future-tenses", name: "Future (Going To)", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar" },
  { id: "comparatives", name: "Comparatives", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar" },
  { id: "superlatives", name: "Superlatives", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar", aliases: ["comparatives"] },
  { id: "containers-partitives", name: "Countable / Uncountable", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar" },
  { id: "quantifiers", name: "Some / Any · Much / Many", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar" },
  { id: "present-perfect-basic", name: "Present Perfect (Basic)", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar", aliases: ["present-perfect"] },
  { id: "conditionals-first", name: "First Conditional", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar", aliases: ["conditionals"] },
  { id: "modal-verbs-advice", name: "Modal Verbs", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "grammar", aliases: ["modal-verbs"] },

  // B1 — IELTS 5.5–6.0
  { id: "present-perfect", name: "Present Perfect", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },
  { id: "present-perfect-continuous", name: "Present Perfect Continuous", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },
  { id: "past-continuous", name: "Past Continuous", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },
  { id: "passive-voice-basic", name: "Passive Voice (Basic)", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar", aliases: ["passive-voice"] },
  { id: "reported-speech-basic", name: "Reported Speech (Basic)", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar", aliases: ["reported-speech"] },
  { id: "relative-clauses", name: "Relative Clauses", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },
  { id: "gerunds-and-infinitives", name: "Gerunds & Infinitives", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },
  { id: "conditionals-second", name: "Second Conditional", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar", aliases: ["conditionals"] },
  { id: "modals-of-advice", name: "Modals of Advice", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar", aliases: ["modal-verbs"] },
  { id: "question-tags", name: "Question Tags", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "grammar" },

  // B2 — IELTS 6.0–7.0
  { id: "passive-voice", name: "Passive Voice", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar", isCritical: true },
  { id: "reported-speech", name: "Reported Speech", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar" },
  { id: "conditionals", name: "Conditionals 0–3", level: "B2", minBand: 6.0, ceilingBand: 6.5, weight: 1, category: "grammar", isCritical: true },
  { id: "mixed-conditionals", name: "Mixed Conditionals", level: "B2", minBand: 6.5, ceilingBand: 7.0, weight: 1, category: "grammar", isCritical: true, aliases: ["conditionals"] },
  { id: "modal-deduction", name: "Modal Deduction", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar", aliases: ["modal-verbs"] },
  { id: "relative-clauses-advanced", name: "Relative Clauses (Advanced)", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar", aliases: ["relative-clauses"] },
  { id: "cleft-sentences", name: "Cleft Sentences", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar" },
  { id: "participle-clauses", name: "Participle Clauses", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar" },
  { id: "wish-if-only", name: "Wish / If Only", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar" },
  { id: "causative", name: "Causative Have", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "grammar" },

  // C1 — IELTS 7.0–8.0
  { id: "advanced-conditionals", name: "Advanced Conditionals", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar", aliases: ["conditionals"] },
  { id: "inversion", name: "Inversion", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar" },
  { id: "subjunctive", name: "Subjunctive", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar" },
  { id: "ellipsis-substitution", name: "Ellipsis", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar" },
  { id: "nominalisation", name: "Nominalisation", level: "C1", minBand: 7.0, ceilingBand: 7.5, weight: 1, category: "grammar", isCritical: true, aliases: ["word-formation"] },
  { id: "hedging", name: "Hedging", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar" },
  { id: "advanced-modal-verbs", name: "Advanced Modal Verbs", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar", aliases: ["modal-verbs"] },
  { id: "complex-relative-clauses", name: "Complex Relative Clauses", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar", aliases: ["relative-clauses"] },
  { id: "formal-academic-structures", name: "Formal Academic Structures", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar", aliases: ["business-english"] },
  { id: "linking-words-and-connectors", name: "Discourse Markers", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "grammar" },

  // C2 — IELTS 8.0–9.0
  { id: "advanced-inversion", name: "Advanced Inversion", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar", aliases: ["inversion"] },
  { id: "emphasis-structures", name: "Emphasis Structures", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar", aliases: ["cleft-sentences"] },
  { id: "advanced-nominalisation", name: "Advanced Nominalisation", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar", aliases: ["word-formation"] },
  { id: "stylistic-variation", name: "Stylistic Variation", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar" },
  { id: "academic-register", name: "Academic Register", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar", aliases: ["business-english"] },
  { id: "complex-sentence-structures", name: "Complex Sentence Structures", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "grammar", aliases: ["participle-clauses"] },
]

/**
 * Vocabulary topics grouped by CEFR deck level.
 * slug = deck slug or synthetic level bucket.
 */
export const VOCABULARY_TOPIC_CATALOGUE = [
  { id: "vocab-a1", name: "General Vocabulary A1", level: "A1", minBand: 4.0, ceilingBand: 4.5, weight: 1, category: "vocabulary", deckLevel: "A1" },
  { id: "vocab-a2", name: "General Vocabulary A2", level: "A2", minBand: 4.5, ceilingBand: 5.5, weight: 1, category: "vocabulary", deckLevel: "A2" },
  { id: "vocab-b1", name: "General Vocabulary B1", level: "B1", minBand: 5.5, ceilingBand: 6.0, weight: 1, category: "vocabulary", deckLevel: "B1" },
  { id: "vocab-b2", name: "General Vocabulary B2", level: "B2", minBand: 6.0, ceilingBand: 7.0, weight: 1, category: "vocabulary", deckLevel: "B2" },
  { id: "vocab-c1", name: "General Vocabulary C1", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "vocabulary", deckLevel: "C1" },
  { id: "vocab-c2", name: "General Vocabulary C2", level: "C2", minBand: 8.0, ceilingBand: 9.0, weight: 1, category: "vocabulary", deckLevel: "C2" },
]

/** Academic vocabulary — IELTS Writing/Reading critical lexis. */
export const ACADEMIC_VOCABULARY_CATALOGUE = [
  { id: "academic-core", name: "Academic Core", level: "B2", minBand: 6.0, ceilingBand: 6.5, weight: 2, category: "academic_vocabulary", isCritical: true },
  { id: "academic-advanced", name: "Academic Advanced", level: "C1", minBand: 7.0, ceilingBand: 7.5, weight: 2, category: "academic_vocabulary", isCritical: true },
  { id: "academic-discipline", name: "Discipline-Specific Lexis", level: "C1", minBand: 7.0, ceilingBand: 8.0, weight: 1, category: "academic_vocabulary" },
  { id: "academic-collocations", name: "Academic Collocations", level: "B2", minBand: 6.5, ceilingBand: 7.0, weight: 1, category: "academic_vocabulary", isCritical: true },
  { id: "academic-hedging-lexis", name: "Hedging & Boosting Lexis", level: "C1", minBand: 7.0, ceilingBand: 7.5, weight: 1, category: "academic_vocabulary" },
]

/** Band progression thresholds (CEFR profile % → max confirmed band). */
export const BAND_PROGRESSION_RULES = [
  { band: 8.5, requirements: { C1: 90, C2: 60 } },
  { band: 8.0, requirements: { C1: 80, C2: 30 } },
  { band: 7.5, requirements: { C1: 65 } },
  { band: 7.0, requirements: { B2: 80, C1: 40 } },
  { band: 6.5, requirements: { B2: 70 } },
  { band: 6.0, requirements: { B1: 65, B2: 30 } },
  { band: 5.5, requirements: { B1: 40 } },
  { band: 5.0, requirements: { A1: 80, A2: 80 } },
  { band: 4.5, requirements: { A1: 80 } },
  { band: 4.0, requirements: {} },
]

/** Skill weights for combined IELTS estimate. */
export const IELTS_SKILL_WEIGHTS = {
  grammar: 0.15,
  vocabulary: 0.1,
  academicVocabulary: 0.1,
  reading: 0.2,
  listening: 0.2,
  writing: 0.15,
  speaking: 0.1,
}

/** Mastery score interpretation thresholds. */
export const MASTERY_SCORE_MASTERED = 80
export const MASTERY_SCORE_PARTIAL = 60

/** Study hours per mastery point gap (for recommendations). */
export const HOURS_PER_MASTERY_POINT = 0.5

// ─── Lookup helpers ─────────────────────────────────────────────────────────

const _slugToTopic = new Map()
const _aliasToTopicId = new Map()

function registerTopic(topic) {
  _slugToTopic.set(topic.id, topic)
  if (topic.aliases) {
    for (const alias of topic.aliases) {
      if (!_aliasToTopicId.has(alias)) _aliasToTopicId.set(alias, topic.id)
    }
  }
}

for (const t of GRAMMAR_TOPIC_CATALOGUE) registerTopic(t)
for (const t of VOCABULARY_TOPIC_CATALOGUE) registerTopic(t)
for (const t of ACADEMIC_VOCABULARY_CATALOGUE) registerTopic(t)

export const ALL_TOPIC_CATALOGUE = [
  ...GRAMMAR_TOPIC_CATALOGUE,
  ...VOCABULARY_TOPIC_CATALOGUE,
  ...ACADEMIC_VOCABULARY_CATALOGUE,
]

export function getTopicById(id) {
  return _slugToTopic.get(id) ?? null
}

/** Resolve exercise topic slug → catalogue topic id (prefers exact, then alias). */
export function resolveCatalogueTopicId(slug, category = "grammar") {
  if (!slug) return null
  if (_slugToTopic.has(slug)) return slug
  const aliasId = _aliasToTopicId.get(slug)
  if (aliasId) return aliasId
  return slug
}

export function getTopicsByLevel(level) {
  return ALL_TOPIC_CATALOGUE.filter((t) => t.level === level)
}

export function getTopicsByCategory(category) {
  return ALL_TOPIC_CATALOGUE.filter((t) => t.category === category)
}

export function getCriticalTopics() {
  return ALL_TOPIC_CATALOGUE.filter((t) => t.isCritical)
}

export function roundIeltsBand(value) {
  return Math.round(value * 2) / 2
}
