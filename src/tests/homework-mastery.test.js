import {
  attemptPassed,
  isMasteryEligibleSubject,
  isMasteryHomework,
  mergeMistakesOnlyAttempt,
  normalizeAttemptItems,
  stripAttemptAnswers,
  submissionAttemptsList,
} from "../services/homeworkMastery.service.js"

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const base = {
  totalQuestions: 10,
  correctCount: 8,
  mistakes: [
    { questionId: 1, prompt: "a", userAnswer: "x", correctAnswer: "y" },
    { questionId: 2, prompt: "b", userAnswer: "x", correctAnswer: "y" },
  ],
  items: [
    { questionId: 1, prompt: "a", isCorrect: false },
    { questionId: 2, prompt: "b", isCorrect: false },
    { questionId: 3, prompt: "c", isCorrect: true },
    { questionId: 4, prompt: "d", isCorrect: true },
    { questionId: 5, prompt: "e", isCorrect: true },
    { questionId: 6, prompt: "f", isCorrect: true },
    { questionId: 7, prompt: "g", isCorrect: true },
    { questionId: 8, prompt: "h", isCorrect: true },
    { questionId: 9, prompt: "i", isCorrect: true },
    { questionId: 10, prompt: "j", isCorrect: true },
  ],
}

const partial = {
  totalQuestions: 2,
  correctCount: 1,
  mistakes: [{ questionId: 1, prompt: "a", userAnswer: "z", correctAnswer: "y" }],
  items: [
    { questionId: 1, prompt: "a", isCorrect: false },
    { questionId: 2, prompt: "b", isCorrect: true },
  ],
}

const merged = mergeMistakesOnlyAttempt(base, partial)
assert(merged.correctCount === 9, `expected 9 got ${merged.correctCount}`)
assert(merged.totalQuestions === 10, "total should stay 10")
assert(attemptPassed(merged, 0.9) === true, "9/10 should pass 90%")
assert(merged.mistakes.length === 1, "one remaining mistake")

assert(isMasteryEligibleSubject("grammar") === true, "grammar eligible")
assert(isMasteryEligibleSubject("vocabulary") === true, "vocab eligible")
assert(isMasteryEligibleSubject("reading") === false, "reading not eligible")
assert(isMasteryEligibleSubject("listening") === false, "listening not eligible")
assert(isMasteryEligibleSubject("speaking") === false, "speaking not eligible")
assert(
  isMasteryHomework({ subject: "listening", masteryMode: true }) === false,
  "listening never mastery even if flag set",
)
assert(
  isMasteryHomework({ subject: "reading", masteryMode: true }) === false,
  "reading never mastery",
)
assert(
  isMasteryHomework({ subject: "speaking", masteryMode: true }) === false,
  "speaking never mastery",
)

const stripped = stripAttemptAnswers(merged)
assert(stripped.mistakes.length === 0, "strip mistakes")
assert(stripped.items.every((i) => i.prompt != null && typeof i.isCorrect === "boolean"), "items ok")
assert(!("correctAnswer" in (stripped.items[0] || {})), "no correctAnswer on items")

const legacy = submissionAttemptsList({
  status: "submitted",
  attempt: base,
})
assert(legacy.length === 1, "legacy single attempt")

const items = normalizeAttemptItems({
  totalQuestions: 3,
  mistakes: [{ questionId: 2, prompt: "q2", userAnswer: "x", correctAnswer: "y" }],
})
assert(items.length === 3, "normalize fills correct placeholders")
assert(items.find((i) => i.questionId === 2)?.isCorrect === false, "q2 wrong")

console.log("homeworkMastery.service ok")
