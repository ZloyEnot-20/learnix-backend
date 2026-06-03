/**
 * Answer keys + CEFR scoring for the placement / entry test.
 * Mirrors front/lib/entry-test-content.ts (strings must match exactly,
 * including the curly apostrophe used in "mustn’t").
 */

// id -> correct option string
export const MC_ANSWER_KEY = {
  1: "lives", 2: "am drinking", 3: "goes / was", 4: "were watching", 5: "have left",
  6: "has finished", 7: "rains", 8: "had", 9: "where", 10: "who",
  11: "since", 12: "for", 13: "had", 14: "had studied", 15: "was completed",
  16: "is being built", 17: "must", 18: "mustn’t", 19: "reading", 20: "to go",
  21: "better", 22: "most interesting", 23: "was", 24: "would", 25: "were",
  26: "would have passed", 27: "had", 28: "knew", 29: "working", 30: "getting",
  31: "had", 32: "had I arrived", 33: "was he", 34: "have I seen", 35: "better",
  36: "taking", 37: "to say", 38: "walking", 39: "have solved", 40: "had",
  41: "to accept", 42: "be", 43: "told", 44: "did", 45: "being",
  46: "in", 47: "which", 48: "which", 49: "had left", 50: "would have done",
}

export const MC_TOTAL = Object.keys(MC_ANSWER_KEY).length // 50

// id -> correct answer (option index for multiple-choice, boolean for true/false)
export const READING_ANSWER_KEY = {
  1: 1, 2: 1, 3: 2, 4: 1, 5: false,
  6: true, 7: 2, 8: 1, 9: 2, 10: 1,
}

export const READING_TOTAL = Object.keys(READING_ANSWER_KEY).length // 10

export function mcLevel(score) {
  if (score <= 15) return "Beginner (A1)"
  if (score <= 25) return "Elementary (A2)"
  if (score <= 35) return "Pre-Intermediate (B1)"
  if (score <= 43) return "Intermediate (B1+)"
  if (score <= 47) return "Upper-Intermediate (B2)"
  return "Strong B2 / B2+"
}

export function readingLevel(score) {
  if (score <= 3) return "Beginner (A1)"
  if (score <= 5) return "Elementary (A2)"
  if (score <= 7) return "Pre-Intermediate (B1)"
  if (score <= 9) return "Intermediate (B1+)"
  return "Upper-Intermediate (B2)"
}

export function scoreMc(answers) {
  let score = 0
  for (const [id, correct] of Object.entries(MC_ANSWER_KEY)) {
    if (answers?.[id] === correct) score += 1
  }
  return score
}

export function scoreReading(answers) {
  let score = 0
  for (const [id, correct] of Object.entries(READING_ANSWER_KEY)) {
    // answers come in as strings/numbers/booleans from JSON; normalise
    const given = answers?.[id]
    if (typeof correct === "boolean") {
      if (given === correct || given === String(correct)) score += 1
    } else if (Number(given) === correct) {
      score += 1
    }
  }
  return score
}
