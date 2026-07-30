/** Subjects that support mastery (retry-until-pass) homework.
 * IELTS reading/listening, speaking, and podcast are intentionally excluded.
 */
export const MASTERY_SUBJECTS = new Set(["grammar", "vocabulary"])

export function isMasteryEligibleSubject(subject) {
  return MASTERY_SUBJECTS.has(subject)
}

export function isMasteryHomework(hw) {
  if (!hw) return false
  if (!isMasteryEligibleSubject(hw.subject)) return false
  return hw.masteryMode === true
}

export function requiredAccuracyOf(hw) {
  const raw = hw?.requiredAccuracy
  if (typeof raw === "number" && raw >= 0 && raw <= 1) return raw
  return 0.9
}

export function attemptAccuracy(attempt) {
  const total = attempt?.totalQuestions ?? 0
  if (total <= 0) return 0
  return (attempt.correctCount ?? 0) / total
}

export function attemptPassed(attempt, requiredAccuracy) {
  return attemptAccuracy(attempt) >= requiredAccuracy
}

/**
 * Build history-safe items from an incoming attempt payload.
 * Prefers client-provided items; falls back to inferring from mistakes only
 * (correct prompts unavailable in that case).
 */
export function normalizeAttemptItems(attempt) {
  if (Array.isArray(attempt?.items) && attempt.items.length > 0) {
    return attempt.items.map((item) => ({
      questionId: item.questionId,
      prompt: item.prompt ?? "",
      isCorrect: !!item.isCorrect,
    }))
  }

  const mistakes = attempt?.mistakes ?? []
  const wrongIds = new Set(mistakes.map((m) => m.questionId))
  const fromMistakes = mistakes.map((m) => ({
    questionId: m.questionId,
    prompt: m.prompt ?? "",
    isCorrect: false,
  }))

  // If we only know mistakes, synthesize correct placeholders without prompts
  // when totalQuestions is known — better than empty history.
  const total = attempt?.totalQuestions ?? 0
  if (total > 0 && fromMistakes.length < total) {
    const known = new Map(fromMistakes.map((i) => [i.questionId, i]))
    const items = []
    for (let q = 1; q <= total; q++) {
      if (known.has(q)) {
        items.push(known.get(q))
      } else if (!wrongIds.has(q)) {
        items.push({ questionId: q, prompt: "", isCorrect: true })
      }
    }
    // Also include any mistake questionIds outside 1..total
    for (const m of fromMistakes) {
      if (m.questionId < 1 || m.questionId > total) items.push(m)
    }
    return items
  }

  return fromMistakes
}

export function stripAttemptAnswers(attempt) {
  if (!attempt) return attempt
  const items = normalizeAttemptItems(attempt)
  return {
    totalQuestions: attempt.totalQuestions ?? 0,
    correctCount: attempt.correctCount ?? 0,
    durationSeconds: attempt.durationSeconds,
    timedOut: attempt.timedOut,
    answeredCount: attempt.answeredCount,
    failedDueToCheating: attempt.failedDueToCheating,
    cheatingReason: attempt.cheatingReason,
    listeningStats: attempt.listeningStats,
    mode: attempt.mode ?? "full",
    passed: !!attempt.passed,
    items,
    mistakes: [],
  }
}

export function projectAttemptForClient(attempt, { revealAnswers }) {
  if (!attempt) return attempt
  if (revealAnswers) {
    return {
      ...attempt,
      mode: attempt.mode ?? "full",
      passed: !!attempt.passed,
      items: normalizeAttemptItems(attempt),
      mistakes: attempt.mistakes ?? [],
    }
  }
  return stripAttemptAnswers(attempt)
}

/**
 * Merge a mistakes-only retry into the base attempt.
 * Correct items from base stay; retried questionIds take new outcomes.
 */
export function mergeMistakesOnlyAttempt(baseAttempt, partialAttempt) {
  const baseItems = normalizeAttemptItems(baseAttempt)
  const partialItems = normalizeAttemptItems(partialAttempt)
  const partialById = new Map(partialItems.map((i) => [i.questionId, i]))

  const wrongIds = new Set(
    baseItems.filter((i) => !i.isCorrect).map((i) => i.questionId),
  )

  for (const id of partialById.keys()) {
    if (!wrongIds.has(id)) {
      const err = new Error(
        `mistakes_only retry includes question ${id} which was not incorrect on the base attempt`,
      )
      err.status = 400
      throw err
    }
  }

  const mergedItems = baseItems.map((item) => {
    const next = partialById.get(item.questionId)
    if (!next) return item
    return {
      questionId: item.questionId,
      prompt: next.prompt || item.prompt,
      isCorrect: !!next.isCorrect,
    }
  })

  const baseMistakes = baseAttempt.mistakes ?? []
  const partialMistakes = partialAttempt.mistakes ?? []
  const partialMistakeById = new Map(partialMistakes.map((m) => [m.questionId, m]))

  const mergedMistakes = []
  for (const item of mergedItems) {
    if (item.isCorrect) continue
    const fromPartial = partialMistakeById.get(item.questionId)
    const fromBase = baseMistakes.find((m) => m.questionId === item.questionId)
    if (fromPartial) mergedMistakes.push(fromPartial)
    else if (fromBase) mergedMistakes.push(fromBase)
    else {
      mergedMistakes.push({
        questionId: item.questionId,
        prompt: item.prompt ?? "",
        userAnswer: "",
        correctAnswer: "",
      })
    }
  }

  const correctCount = mergedItems.filter((i) => i.isCorrect).length
  const totalQuestions = baseAttempt.totalQuestions || mergedItems.length

  return {
    totalQuestions,
    correctCount,
    durationSeconds: partialAttempt.durationSeconds ?? baseAttempt.durationSeconds,
    timedOut: partialAttempt.timedOut,
    answeredCount: totalQuestions,
    mistakes: mergedMistakes,
    items: mergedItems,
    mode: "mistakes_only",
    listeningStats: partialAttempt.listeningStats,
    readingAnswers: baseAttempt.readingAnswers,
    failedDueToCheating: partialAttempt.failedDueToCheating,
    cheatingReason: partialAttempt.cheatingReason,
  }
}

export function finalizeAttemptRecord(rawAttempt, { passed, mode }) {
  const items = normalizeAttemptItems(rawAttempt)
  return {
    ...rawAttempt,
    mode: mode ?? rawAttempt.mode ?? "full",
    passed: !!passed,
    items,
    mistakes: rawAttempt.mistakes ?? [],
  }
}

export function submissionAttemptsList(sub) {
  if (Array.isArray(sub?.attempts) && sub.attempts.length > 0) {
    return sub.attempts
  }
  if (sub?.attempt && (sub.status === "submitted" || sub.status === "graded" || sub.status === "needs_retry")) {
    return [sub.attempt]
  }
  return []
}

/**
 * Project submission for API: hide correct/user answers until mastery pass
 * (or always show for non-mastery completed work).
 *
 * In-progress drafts keep full mistakes so the student can resume.
 */
export function projectSubmissionForClient(sub, { masteryMode } = {}) {
  if (!sub) return sub
  const json = typeof sub.toJSON === "function" ? sub.toJSON() : { ...sub }
  const isMastery = masteryMode === true || json.masteryMode === true
  const status = json.status
  const revealAnswers =
    !isMastery || status === "submitted" || status === "graded"
  const keepDraftAnswers =
    isMastery && (status === "in_progress" || status === "paused")

  const reveal = revealAnswers || keepDraftAnswers

  if (json.attempt) {
    json.attempt = projectAttemptForClient(json.attempt, { revealAnswers: reveal })
  }

  const history = submissionAttemptsList(json)
  if (history.length > 0) {
    // History never exposes answers — only prompt + isCorrect.
    json.attempts = history.map((a) => stripAttemptAnswers(a))
  } else {
    json.attempts = []
  }

  return json
}
