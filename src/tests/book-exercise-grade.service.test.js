import assert from "node:assert/strict"
import {
  gradeLiveExerciseAnswers,
  matchesKey,
  expandSlashAlternatives,
  textContainsExpected,
  isExpressionListKey,
  isBucketMapKey,
} from "../services/book-exercise-grade.service.js"

// --- slash expansion ---
assert.deepEqual(expandSlashAlternatives("contemporary/current/topical").sort(), [
  "contemporary",
  "current",
  "topical",
].sort())
assert.deepEqual(
  expandSlashAlternatives("the past is a/another country").sort(),
  ["the past is a country", "the past is another country"].sort(),
)

assert.equal(matchesKey("the past is another country", "the past is a/another country"), true)
assert.equal(matchesKey("the past is a country", "the past is a/another country"), true)
assert.equal(matchesKey("current", "contemporary/current/topical"), true)
assert.equal(matchesKey("drags on and on", "drags on (and on)"), true)
assert.equal(matchesKey("drags on", "drags on (and on)"), true)
assert.equal(matchesKey("pressed for time", "pressed for time"), true)

// --- expression list detection ---
const exprKey = {
  speaker_1: ["spare time", "pressed for time"],
  speaker_2: ["brief", "fleeting"],
}
assert.equal(isExpressionListKey(exprKey), true)
assert.equal(isBucketMapKey(exprKey), false)
assert.equal(
  isBucketMapKey({ past: ["retrospect"], present: ["current"] }),
  true,
)

// --- grade expressions (unit 2 / 1.3 style) ---
const studentNotes = {
  kind: "expressions",
  speaker_1:
    "spare time, last an eternity, drags on and on, went on for ages, had so much time on my hands, in next to no time, time seems to speed up, it just goes so fast, there aren't enough hours in the day, pressed for time",
  speaker_2:
    "the past is another country; for hours and hours at a time; time passes in the blink of an eye; make the most of every moment of it; an instant ago; have the time of their life; brief; fleeting",
}

const graded = gradeLiveExerciseAnswers({
  answerKey: {
    speaker_1: [
      "spare time",
      "last an eternity",
      "drags on (and on)",
      "(went on for) ages",
      "had so much time on my hands",
      "in next to no time",
      "time seems to speed up",
      "it just goes so fast",
      "there aren't enough hours in the day",
      "pressed for time",
    ],
    speaker_2: [
      "the past is a/another country",
      "for hours and hours at a time",
      "time passes in the blink of an eye",
      "make the most of every moment of it (time)",
      "an instant (ago)",
      "have the time of their life",
      "brief",
      "fleeting",
    ],
  },
  studentAnswers: studentNotes,
})

assert.equal(graded.graded, true)
assert.equal(graded.total, 18)
assert.ok(graded.correct >= 16, `expected >=16 correct, got ${graded.correct}`)
assert.ok(
  graded.items.every((item) => !/^speaker[_\s]?\d+$/i.test(item.label)),
  "labels must be expressions, not speaker_1",
)
assert.equal(graded.items[0].label, "spare time")

// Wrong path: must NOT treat as buckets (would label words as speaker_1)
const wrongPath = gradeLiveExerciseAnswers({
  answerKey: exprKey,
  studentAnswers: { kind: "expressions", speaker_1: "spare time", speaker_2: "brief" },
})
assert.equal(wrongPath.items[0].label, "spare time")
assert.equal(wrongPath.items[0].expected, "spare time")
assert.notEqual(wrongPath.items[0].expected, "speaker_1")

// --- list with slash alts ---
const listGraded = gradeLiveExerciseAnswers({
  answerKey: ["bygone", "contemporary/current/topical", "status quo"],
  studentAnswers: { kind: "list", values: ["bygone", "current", "status quo"] },
})
assert.equal(listGraded.correct, 3)
assert.equal(listGraded.total, 3)

// --- speakers single value ---
const speakers = gradeLiveExerciseAnswers({
  answerKey: { speaker_1: "question 1", speaker_2: "question 4" },
  studentAnswers: { kind: "speakers", speaker_1: "question 1", speaker_2: "question 4" },
})
assert.equal(speakers.correct, 2)

assert.equal(textContainsExpected("I had spare time yesterday", "spare time"), true)
assert.equal(textContainsExpected("hello", "spare time"), false)

console.log("book-exercise-grade.service.test.js: ok")
