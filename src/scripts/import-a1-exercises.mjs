/**
 * Import grammar test JSON (A1/A2/…) into MongoDB.
 *
 * Keeps each test as ONE exercise with all questions (typically 10).
 * Mixed question types stay together; `questionTypes` lists every type
 * present so topic filters can show the same card for each type.
 *
 * Usage: node src/scripts/import-a1-exercises.mjs [path-to.json]
 */
import fs from "fs"
import path from "path"
import { setServers } from "node:dns"
import { fileURLToPath } from "url"
import mongoose from "../config/mongoose.js"
import { env } from "../config/env.js"
import { buildMongoConnectOptions } from "../config/mongoOptions.js"
import { Exercise } from "../models/Exercise.js"
import { Topic } from "../models/Topic.js"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCE = "D:/tests/A1.json"
const BLANK_TOKEN = "_____"

const TOPIC_ALIASES = {
  // A1
  "there is / there are": "there-is-there-are",
  "there is there are": "there-is-there-are",
  "present simple": "present-simple",
  "present continuous": "present-continuous",
  "can / can't": "can-cant",
  "can can't": "can-cant",
  "have got": "have-got",
  articles: "articles",
  "prepositions of place": "prepositions-of-place",
  possessives: "possessives",
  "basic questions": "basic-questions",
  // A2
  "past simple": "past-simple",
  "future (going to)": "future-going-to",
  "future going to": "future-going-to",
  comparatives: "comparatives",
  superlatives: "superlatives",
  "countable / uncountable": "countable-uncountable",
  "countable uncountable": "countable-uncountable",
  "some / any": "some-any",
  "some any": "some-any",
  "much / many": "much-many",
  "much many": "much-many",
  "present perfect": "present-perfect",
  "first conditional": "first-conditional",
  "modal verbs": "modal-verbs",
  // B1
  "present perfect continuous": "present-perfect-continuous",
  "passive voice": "passive-voice",
  "reported speech": "reported-speech",
  "relative clauses": "relative-clauses",
  "gerunds & infinitives": "gerunds-and-infinitives",
  "gerunds and infinitives": "gerunds-and-infinitives",
  "second conditional": "second-conditional",
  "modals of advice": "modals-of-advice",
  "question tags": "question-tags",
  // B2
  "conditionals 0–3": "conditionals",
  "conditionals 0-3": "conditionals",
  "mixed conditionals": "mixed-conditionals",
  "modal deduction": "modal-deduction",
  "cleft sentences": "cleft-sentences",
  "participle clauses": "participle-clauses",
  "wish / if only": "wish-if-only",
  "wish if only": "wish-if-only",
  "causative have": "causative",
  // C1
  "advanced conditionals": "advanced-conditionals",
  inversion: "inversion",
  subjunctive: "subjunctive",
  ellipsis: "ellipsis-substitution",
  nominalisation: "nominalisation",
  hedging: "hedging",
  "advanced modal verbs": "advanced-modal-verbs",
  "complex relative clauses": "complex-relative-clauses",
  "formal academic structures": "formal-academic-structures",
  "discourse markers": "linking-words-and-connectors",
}

const DEFAULT_TYPE_INSTRUCTIONS = {
  "fill-in-the-blank": "Complete the sentence with the correct answer.",
  "multiple-choice": "Choose the best answer to complete the sentence.",
  "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
  "error-correction": "The sentence has a mistake. Click the wrong part and type the correction.",
}

/** Topic-specific instructions for imported A1/A2 mixed tests. */
const TOPIC_INSTRUCTIONS = {
  "there-is-there-are": {
    exercise:
      "Practise There is / There are with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with There is or There are.",
      "multiple-choice": "Choose the correct option: There is, There are, Is there, or Are there.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find the mistake and correct the use of There is / There are.",
    },
  },
  "present-simple": {
    exercise:
      "Practise the present simple with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct present simple verb form.",
      "multiple-choice": "Choose the correct present simple form to complete the sentence.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the present simple form.",
    },
  },
  "present-continuous": {
    exercise:
      "Practise the present continuous with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct present continuous form (be + -ing).",
      "multiple-choice": "Choose the correct present continuous form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the present continuous form.",
    },
  },
  "can-cant": {
    exercise:
      "Practise can / can't with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with can or can't.",
      "multiple-choice": "Choose the correct option with can or can't.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with can / can't.",
    },
  },
  "have-got": {
    exercise:
      "Practise have got with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with have got, has got, haven't got, or hasn't got.",
      "multiple-choice": "Choose the correct have got form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with have got.",
    },
  },
  articles: {
    exercise:
      "Practise articles (a, an, the) with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with a, an, or the.",
      "multiple-choice": "Choose the correct article: a, an, or the.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with articles.",
    },
  },
  "prepositions-of-place": {
    exercise:
      "Practise prepositions of place with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct preposition of place (in, on, at, under, behind, etc.).",
      "multiple-choice": "Choose the correct preposition of place.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the preposition of place.",
    },
  },
  possessives: {
    exercise:
      "Practise possessives with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct possessive (my, your, his, her, its, our, their).",
      "multiple-choice": "Choose the correct possessive adjective or pronoun.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with possessives.",
    },
  },
  "basic-questions": {
    exercise:
      "Practise question formation with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each question with the correct word or auxiliary.",
      "multiple-choice": "Choose the correct question form.",
      "true-false": "Is this question grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the question.",
    },
  },
  "past-simple": {
    exercise:
      "Practise the past simple with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct past simple verb form.",
      "multiple-choice": "Choose the correct past simple form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the past simple form.",
    },
  },
  "future-going-to": {
    exercise:
      "Practise going to future with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct going to future form.",
      "multiple-choice": "Choose the correct going to future form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with going to future.",
    },
  },
  comparatives: {
    exercise:
      "Practise comparatives with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence using the comparative form shown in brackets.",
      "multiple-choice": "Choose the correct comparative form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the comparative form.",
    },
  },
  superlatives: {
    exercise:
      "Practise superlatives with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence using the superlative form shown in brackets.",
      "multiple-choice": "Choose the correct superlative form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the superlative form.",
    },
  },
  "countable-uncountable": {
    exercise:
      "Practise countable and uncountable nouns with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct countable or uncountable noun form.",
      "multiple-choice": "Choose the correct countable/uncountable form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with countable/uncountable nouns.",
    },
  },
  "some-any": {
    exercise:
      "Practise some / any with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with some or any.",
      "multiple-choice": "Choose the correct option: some or any.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with some / any.",
    },
  },
  "much-many": {
    exercise:
      "Practise much / many with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with much or many.",
      "multiple-choice": "Choose the correct option: much or many.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with much / many.",
    },
  },
  "present-perfect": {
    exercise:
      "Practise the present perfect with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct present perfect form (have/has + past participle).",
      "multiple-choice": "Choose the correct present perfect form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the present perfect form.",
    },
  },
  "first-conditional": {
    exercise:
      "Practise the first conditional with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each first conditional sentence (If + present simple, will + infinitive).",
      "multiple-choice": "Choose the correct first conditional form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the first conditional.",
    },
  },
  "modal-verbs": {
    exercise:
      "Practise modal verbs with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct modal verb.",
      "multiple-choice": "Choose the correct modal verb.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with modal verbs.",
    },
  },
  "present-perfect-continuous": {
    exercise:
      "Practise the present perfect continuous with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct present perfect continuous form (have/has been + -ing).",
      "multiple-choice": "Choose the correct present perfect continuous form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the present perfect continuous form.",
    },
  },
  "past-continuous": {
    exercise:
      "Practise the past continuous with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct past continuous form (was/were + -ing).",
      "multiple-choice": "Choose the correct past continuous form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the past continuous form.",
    },
  },
  "passive-voice": {
    exercise:
      "Practise the passive voice with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct passive form (be + past participle).",
      "multiple-choice": "Choose the correct passive voice form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the passive voice.",
    },
  },
  "reported-speech": {
    exercise:
      "Practise reported speech with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct reported speech form.",
      "multiple-choice": "Choose the correct reported speech option.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in reported speech.",
    },
  },
  "relative-clauses": {
    exercise:
      "Practise relative clauses with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with who, which, that, where, whose, or another relative form.",
      "multiple-choice": "Choose the correct relative clause form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the relative clause.",
    },
  },
  "gerunds-and-infinitives": {
    exercise:
      "Practise gerunds and infinitives with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct gerund (-ing) or infinitive (to + verb).",
      "multiple-choice": "Choose the correct gerund or infinitive form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with gerunds / infinitives.",
    },
  },
  "second-conditional": {
    exercise:
      "Practise the second conditional with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each second conditional sentence (If + past simple, would + infinitive).",
      "multiple-choice": "Choose the correct second conditional form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the second conditional.",
    },
  },
  "modals-of-advice": {
    exercise:
      "Practise modals of advice (should, ought to, had better) with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with should, ought to, or had better.",
      "multiple-choice": "Choose the correct modal of advice.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with modals of advice.",
    },
  },
  "question-tags": {
    exercise:
      "Practise question tags with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct question tag.",
      "multiple-choice": "Choose the correct question tag.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the question tag.",
    },
  },
  conditionals: {
    exercise:
      "Practise zero, first, second, and third conditionals with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct conditional form.",
      "multiple-choice": "Choose the correct conditional form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the conditional sentence.",
    },
  },
  "mixed-conditionals": {
    exercise:
      "Practise mixed conditionals with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct mixed conditional form.",
      "multiple-choice": "Choose the correct mixed conditional form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the mixed conditional.",
    },
  },
  "modal-deduction": {
    exercise:
      "Practise modals of deduction (must, may, might, could, can't) with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank":
        "Complete each sentence with the correct modal of deduction (must, may, might, could, can't).",
      "multiple-choice": "Choose the correct modal of deduction.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with modals of deduction.",
    },
  },
  "cleft-sentences": {
    exercise:
      "Practise cleft sentences (It is/was … that/who) with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each cleft sentence with the correct form.",
      "multiple-choice": "Choose the correct cleft sentence form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the cleft sentence.",
    },
  },
  "participle-clauses": {
    exercise:
      "Practise participle clauses with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct participle clause (-ing or past participle).",
      "multiple-choice": "Choose the correct participle clause form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the participle clause.",
    },
  },
  "wish-if-only": {
    exercise:
      "Practise wish / if only with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct wish / if only form.",
      "multiple-choice": "Choose the correct wish / if only form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with wish / if only.",
    },
  },
  causative: {
    exercise:
      "Practise causative have/get with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct causative form (have/get + object + past participle).",
      "multiple-choice": "Choose the correct causative form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the causative structure.",
    },
  },
  "advanced-conditionals": {
    exercise:
      "Practise advanced conditionals and inversion with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct advanced conditional or inversion form.",
      "multiple-choice": "Choose the correct advanced conditional form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the advanced conditional.",
    },
  },
  inversion: {
    exercise:
      "Practise inversion with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct inverted form.",
      "multiple-choice": "Choose the correct inversion.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the inverted structure.",
    },
  },
  subjunctive: {
    exercise:
      "Practise the subjunctive mood with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct subjunctive form.",
      "multiple-choice": "Choose the correct subjunctive form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the subjunctive.",
    },
  },
  "ellipsis-substitution": {
    exercise:
      "Practise ellipsis and substitution with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct ellipsis or substitution form.",
      "multiple-choice": "Choose the correct ellipsis / substitution option.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with ellipsis / substitution.",
    },
  },
  nominalisation: {
    exercise:
      "Practise nominalisation with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct nominalised form.",
      "multiple-choice": "Choose the correct nominalisation.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in nominalisation.",
    },
  },
  hedging: {
    exercise:
      "Practise hedging language with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct hedging expression.",
      "multiple-choice": "Choose the correct hedging form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in hedging language.",
    },
  },
  "advanced-modal-verbs": {
    exercise:
      "Practise advanced modal verbs with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct advanced modal verb.",
      "multiple-choice": "Choose the correct advanced modal verb.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with advanced modal verbs.",
    },
  },
  "complex-relative-clauses": {
    exercise:
      "Practise complex relative clauses with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct complex relative clause form.",
      "multiple-choice": "Choose the correct complex relative clause.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the relative clause.",
    },
  },
  "formal-academic-structures": {
    exercise:
      "Practise formal academic structures with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct formal academic structure.",
      "multiple-choice": "Choose the correct formal academic form.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake in the formal structure.",
    },
  },
  "linking-words-and-connectors": {
    exercise:
      "Practise discourse markers and linking words with gap-fill, multiple choice, true/false, and error correction.",
    byType: {
      "fill-in-the-blank": "Complete each sentence with the correct discourse marker or connector.",
      "multiple-choice": "Choose the correct discourse marker.",
      "true-false": "Is this sentence grammatically correct? Choose Correct or Incorrect.",
      "error-correction": "Find and correct the mistake with discourse markers.",
    },
  },
}

function instructionForQuestion(topicSlug, questionType) {
  const topic = TOPIC_INSTRUCTIONS[topicSlug]
  return (
    topic?.byType?.[questionType] ??
    DEFAULT_TYPE_INSTRUCTIONS[questionType] ??
    DEFAULT_TYPE_INSTRUCTIONS["fill-in-the-blank"]
  )
}

function exerciseInstructionsForTopic(topicSlug, baseTitle) {
  const topic = TOPIC_INSTRUCTIONS[topicSlug]
  return (
    topic?.exercise ??
    `Practise ${baseTitle} with gap-fill, multiple choice, true/false, and error correction.`
  )
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function normalizeTopicKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function inferTopicTitle(exerciseTitle) {
  return String(exerciseTitle)
    .replace(/\s*[-–—]\s*Test\s*\d+.*$/i, "")
    .replace(/\s+Test\s*\d+.*$/i, "")
    .trim()
}

function normalizeBlankText(text) {
  return String(text ?? "").replace(/_{3,}/g, BLANK_TOKEN)
}

function buildErrorCorrectionAnswer(segments) {
  return segments
    .map((s) => `${s.correctText ?? s.text ?? ""}${s.after ?? ""}`)
    .join("")
    .trim()
}

function normalizeQuestion(raw, topicSlug) {
  const type = String(raw.type ?? "fill-in-the-blank").trim()
  const q = {
    id: Number(raw.id) || 0,
    type,
    text: normalizeBlankText(raw.text),
    explanation: raw.explanation ?? "",
    instruction:
      raw.instruction?.trim() ||
      raw.instructions?.trim() ||
      (topicSlug ? instructionForQuestion(topicSlug, type) : DEFAULT_TYPE_INSTRUCTIONS[type]),
  }
  if (raw.hint) q.hint = raw.hint

  if (type === "fill-in-the-blank") {
    q.blanks = Array.isArray(raw.blanks) ? raw.blanks.map(String) : []
    q.acceptableAnswers = Array.isArray(raw.acceptableAnswers)
      ? raw.acceptableAnswers.map((row) =>
          Array.isArray(row) ? row.map(String) : [String(row)],
        )
      : q.blanks.map((b) => [b])
  } else if (type === "multiple-choice") {
    q.options = Array.isArray(raw.options) ? raw.options.map(String) : []
    q.correctAnswer = String(raw.correctAnswer ?? "")
  } else if (type === "true-false") {
    q.correctBool = Boolean(raw.correctBool)
  } else if (type === "error-correction") {
    q.segments = (raw.segments ?? []).map((seg, i) => {
      const out = {
        id: String(seg.id ?? `s${i + 1}`),
        text: String(seg.text ?? ""),
      }
      if (seg.after) out.after = String(seg.after)
      if (seg.correctText) out.correctText = String(seg.correctText)
      else if (seg.error && seg.correctText) out.correctText = String(seg.correctText)
      if (Array.isArray(seg.acceptableText)) out.acceptableText = seg.acceptableText.map(String)
      if (seg.hint) out.hint = String(seg.hint)
      return out
    })
    q.answer = raw.answer ? String(raw.answer) : buildErrorCorrectionAnswer(q.segments)
    if (Array.isArray(raw.accepted)) q.accepted = raw.accepted.map(String)
  }

  return q
}

function collectQuestionTypes(questions) {
  const types = []
  for (const q of questions) {
    const t = q.type
    if (t && !types.includes(t)) types.push(t)
  }
  return types
}

function difficultyForLevel(level) {
  const l = String(level ?? "A1").toUpperCase()
  if (l === "A1" || l === "A2") return "easy"
  if (l === "B1" || l === "B2") return "medium"
  return "hard"
}

/** B1+ slugs include level so they don't overwrite A1/A2 tests on the same topic. */
function exerciseSlug(topicSlug, level, testNumber) {
  const l = String(level ?? "A1").toUpperCase()
  if (l === "A1" || l === "A2") {
    return slugify(`${topicSlug}-test-${testNumber}`)
  }
  return slugify(`${topicSlug}-${l.toLowerCase()}-test-${testNumber}`)
}

function buildExercise({ item, topicSlug, baseTitle, testNumber }) {
  const questions = (item.content?.questions ?? []).map((raw) =>
    normalizeQuestion(raw, topicSlug),
  )
  const questionTypes = collectQuestionTypes(questions)
  const totalQuestions = questions.length
  const estimatedTime = Math.max(8, Math.round(totalQuestions * 1.2))
  const level = item.level || "A1"
  const slug = exerciseSlug(topicSlug, level, testNumber)

  // Prefer "mixed" when more than one question type; else the single type.
  const type = questionTypes.length > 1 ? "mixed" : questionTypes[0] || "fill-in-the-blank"

  return {
    id: slug,
    slug,
    title: String(item.title || `${baseTitle} - Test ${testNumber}`).trim(),
    description:
      item.description ||
      `${totalQuestions} questions practising ${baseTitle} (${level}).`,
    category: "grammar",
    topic: topicSlug,
    subtopic: "practice",
    difficulty: difficultyForLevel(level),
    level,
    type,
    questionTypes,
    estimatedTime,
    totalQuestions,
    passingScore: Math.max(1, Math.ceil(totalQuestions * 0.7)),
    tags: [baseTitle, level, ...questionTypes],
    instructions:
      item.instructions?.trim() ||
      item.content?.instructions?.trim() ||
      exerciseInstructionsForTopic(topicSlug, baseTitle),
    tips: item.tips ?? [],
    content: { questions },
  }
}

function resolveTopicSlug(topicTitle, existingBySlug, existingByTitle) {
  const key = normalizeTopicKey(topicTitle)
  const aliased = TOPIC_ALIASES[key]
  if (aliased && existingBySlug.has(aliased)) {
    return { slug: aliased, created: false, title: existingBySlug.get(aliased).title }
  }
  if (aliased) return { slug: aliased, created: true, title: topicTitle }

  const byTitle = existingByTitle.get(key)
  if (byTitle) return { slug: byTitle.slug, created: false, title: byTitle.title }

  const slug = slugify(topicTitle)
  if (existingBySlug.has(slug)) {
    return { slug, created: false, title: existingBySlug.get(slug).title }
  }
  return { slug, created: true, title: topicTitle }
}

async function main() {
  const sourcePath = path.resolve(process.argv[2] ?? DEFAULT_SOURCE)
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"))
  if (!Array.isArray(raw)) {
    console.error("Expected top-level array of topic groups")
    process.exit(1)
  }

  await mongoose.connect(env.mongoUri, buildMongoConnectOptions(env.dbName))

  try {
    const existingTopics = await Topic.find({}).lean()
    const existingBySlug = new Map(existingTopics.map((t) => [t.slug, t]))
    const existingByTitle = new Map(
      existingTopics.map((t) => [normalizeTopicKey(t.title), t]),
    )

    const topicsToUpsert = new Map()
    const exercises = []
    const summary = []
    const topicSlugsInImport = new Set()

    for (const group of raw) {
      if (!Array.isArray(group) || group.length === 0) continue
      const baseTitle = inferTopicTitle(group[0].title)
      const level = group[0].level || "A1"
      const resolved = resolveTopicSlug(baseTitle, existingBySlug, existingByTitle)
      topicSlugsInImport.add(resolved.slug)

      if (resolved.created && !topicsToUpsert.has(resolved.slug)) {
        topicsToUpsert.set(resolved.slug, {
          slug: resolved.slug,
          title: resolved.title,
          description: `${resolved.title} practice for ${level} learners.`,
          levels: level,
          exerciseCount: 0,
          questionCount: 0,
          totalMinutes: 0,
          color: "",
          order: existingTopics.length + topicsToUpsert.size,
        })
      }

      let groupExerciseCount = 0
      let groupQuestionCount = 0

      group.forEach((item, idx) => {
        const testNumber =
          Number(String(item.title).match(/Test\s*(\d+)/i)?.[1]) || idx + 1
        const ex = buildExercise({ item, topicSlug: resolved.slug, baseTitle, testNumber })
        exercises.push(ex)
        groupExerciseCount += 1
        groupQuestionCount += ex.totalQuestions
      })

      if (topicsToUpsert.has(resolved.slug)) {
        const t = topicsToUpsert.get(resolved.slug)
        t.exerciseCount = groupExerciseCount
        t.questionCount = groupQuestionCount
        t.totalMinutes = Math.round(groupQuestionCount * 0.6)
      }

      summary.push({
        topic: resolved.slug,
        title: resolved.title,
        created: resolved.created,
        exercises: groupExerciseCount,
        questions: groupQuestionCount,
      })
    }

    // Remove previously imported split exercises for these topics
    // (old slugs like topic-test-1-fill-in-the-blank)
    const deleteFilter = {
      topic: { $in: [...topicSlugsInImport] },
      $or: [
        { slug: { $regex: /-test-\d+-(fill-in-the-blank|multiple-choice|true-false|error-correction)$/ } },
        { slug: { $regex: /-test-\d+$/ } },
        { "data.tags": "A1" },
      ],
    }
    // Safer: delete by known new slugs' topic + subtopic pattern from last bad import
    const delSplit = await Exercise.deleteMany({
      topic: { $in: [...topicSlugsInImport] },
      slug: {
        $regex:
          /-test-\d+-(fill-in-the-blank|multiple-choice|true-false|error-correction|word-order|matching)$/,
      },
    })
    console.log(`Removed split exercises: ${delSplit.deletedCount}`)

    // Also replace whole-test slugs we'll upsert (clean slate for this import set)
    const newSlugs = exercises.map((e) => e.slug)
    const delWhole = await Exercise.deleteMany({
      _id: { $in: newSlugs },
    })
    console.log(`Cleared existing whole-test slugs: ${delWhole.deletedCount}`)

    let topicsWritten = 0
    if (topicsToUpsert.size > 0) {
      const topicOps = [...topicsToUpsert.values()].map((t, idx) => ({
        updateOne: {
          filter: { _id: t.slug },
          update: {
            $set: {
              slug: t.slug,
              title: t.title,
              description: t.description ?? "",
              levels: t.levels ?? "A1",
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
      const result = await Topic.bulkWrite(topicOps, { ordered: false })
      topicsWritten = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
    }

    let exercisesWritten = 0
    const CHUNK = 100
    for (let i = 0; i < exercises.length; i += CHUNK) {
      const chunk = exercises.slice(i, i + CHUNK)
      const ops = chunk.map((ex) => {
        const data = { ...ex, slug: ex.slug, id: ex.id ?? ex.slug }
        return {
          updateOne: {
            filter: { _id: ex.slug },
            update: {
              $set: {
                slug: ex.slug,
                title: ex.title,
                category: ex.category ?? "grammar",
                topic: ex.topic,
                subtopic: ex.subtopic ?? "",
                type: ex.type,
                level: ex.level ?? "A1",
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
      const result = await Exercise.bulkWrite(ops, { ordered: false })
      exercisesWritten += (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0)
    }

    console.log(`\n=== Import summary (${path.basename(sourcePath)}) ===`)
    for (const row of summary) {
      console.log(
        `${row.created ? "NEW " : "EXISTING "} ${row.topic} (${row.title}) → ${row.exercises} tests, ${row.questions} questions`,
      )
    }
    console.log(`\nTopics written: ${topicsWritten}`)
    console.log(`Exercises written: ${exercisesWritten} (expected ${exercises.length})`)
    const sample = exercises[0]
    console.log(
      `Sample: ${sample.slug} type=${sample.type} questions=${sample.totalQuestions} questionTypes=${sample.questionTypes.join(",")}`,
    )
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
