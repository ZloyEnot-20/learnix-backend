/**
 * Resolve denormalized topic fields on Submission from Homework + Exercise/VocabDeck.
 */
import { Exercise } from "../models/Exercise.js"
import { VocabDeck } from "../models/VocabDeck.js"
import { grammarTopicLevel, vocabDeckLevel } from "../config/language-profile.js"

const VOCAB_PREFIX = "vocab:"

function parseVocabSlug(exerciseSlug) {
  if (!exerciseSlug?.startsWith(VOCAB_PREFIX)) return null
  return exerciseSlug.slice(VOCAB_PREFIX.length)
}

/**
 * @param {import("../models/Homework.js").Homework | null | undefined} hw
 * @param {object} [cached] — optional preloaded exercise/deck
 */
export async function resolveSubmissionTopicFields(hw, cached = {}) {
  if (!hw) {
    return {
      grammarTopic: null,
      vocabularyTopic: null,
      grammarLevel: null,
      vocabularyLevel: null,
    }
  }

  const slug = hw.exerciseSlug
  if (!slug) {
    return {
      grammarTopic: null,
      vocabularyTopic: null,
      grammarLevel: null,
      vocabularyLevel: null,
    }
  }

  if (hw.subject === "grammar" || hw.subject === "speaking") {
    const exercise =
      cached.exercise ??
      (await Exercise.findById(slug).select("topic level").lean())
    const topic = exercise?.topic ?? null
    return {
      grammarTopic: hw.subject === "grammar" ? topic : null,
      vocabularyTopic: null,
      grammarLevel: topic ? grammarTopicLevel(topic) : null,
      vocabularyLevel: null,
    }
  }

  if (hw.subject === "vocabulary") {
    const deckSlug = parseVocabSlug(slug) ?? slug
    const deck =
      cached.deck ??
      (await VocabDeck.findById(deckSlug).select("slug topic level difficulty").lean())
    const topic = deck?.slug ?? deckSlug
    const level = deck
      ? vocabDeckLevel(deck.level, deck.difficulty)
      : null
    return {
      grammarTopic: null,
      vocabularyTopic: topic,
      grammarLevel: null,
      vocabularyLevel: level,
    }
  }

  return {
    grammarTopic: null,
    vocabularyTopic: null,
    grammarLevel: null,
    vocabularyLevel: null,
  }
}

/** Apply resolved fields onto a submission document. */
export function applySubmissionTopicFields(sub, fields) {
  if (fields.grammarTopic != null) sub.grammarTopic = fields.grammarTopic
  if (fields.vocabularyTopic != null) sub.vocabularyTopic = fields.vocabularyTopic
  if (fields.grammarLevel != null) sub.grammarLevel = fields.grammarLevel
  if (fields.vocabularyLevel != null) sub.vocabularyLevel = fields.vocabularyLevel
}
