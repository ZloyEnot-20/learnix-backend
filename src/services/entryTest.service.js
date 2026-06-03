/** Recompute an entry test's status from its section progress. */
export function recomputeStatus(doc) {
  if (doc.writingLevel != null && doc.overallLevel != null) return "graded"
  if (doc.mcCompleted && doc.readingCompleted && doc.writingSubmitted) {
    return "awaiting_review"
  }
  const mcStarted = doc.mcAnswers && doc.mcAnswers.size > 0
  const readingStarted = doc.readingAnswers && doc.readingAnswers.size > 0
  const writingStarted = (doc.writingText ?? "").trim().length > 0
  return mcStarted || readingStarted || writingStarted ? "in_progress" : "assigned"
}
