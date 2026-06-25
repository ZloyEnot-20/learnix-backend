/** Max timeline events kept on each homework submission record. */
const MAX_SUBMISSION_EVENTS = 100

/**
 * Append a timeline event to a homework submission record.
 * All homework stats and audit trail live on Submission (single collection).
 */
export function appendSubmissionEvent(sub, { type, reason, entryCount, metadata }) {
  if (!sub.events) sub.events = []
  sub.events.push({
    at: new Date(),
    type,
    reason: reason ?? undefined,
    entryCount: entryCount ?? undefined,
    metadata: metadata ?? undefined,
  })
  if (sub.events.length > MAX_SUBMISSION_EVENTS) {
    sub.events = sub.events.slice(-MAX_SUBMISSION_EVENTS)
  }
}

export function isCheatingSubmission(sub) {
  return sub.integrityStatus === "cheating_detected" || !!sub.attempt?.failedDueToCheating
}

/** Mongo $match fragment: homework failed for cheating must not earn XP. */
export const EXCLUDE_CHEATING_HOMEWORK_MATCH = {
  integrityStatus: { $ne: "cheating_detected" },
  "attempt.failedDueToCheating": { $ne: true },
}

/** Aggregate integrity stats from submission records (homework check / student summary). */
export function aggregateHomeworkIntegrity(submissions) {
  const byReason = {}
  let violations = 0
  let cheating = 0

  for (const sub of submissions) {
    violations += sub.violationCount ?? 0
    if (isCheatingSubmission(sub)) {
      cheating += 1
    }
    for (const ev of sub.events ?? []) {
      if (ev.type !== "violation" && ev.type !== "cheating") continue
      const reason = ev.reason ?? ev.metadata?.reason ?? "unknown"
      byReason[reason] = (byReason[reason] ?? 0) + 1
    }
  }

  return { violations, cheating, byReason }
}
