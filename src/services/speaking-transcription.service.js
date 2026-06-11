import { Submission } from "../models/Submission.js"
import { ControlWorkSubmission } from "../models/ControlWorkSubmission.js"
import { transcribeMistakes } from "./whisper.service.js"

/**
 * Transcribe speaking recordings for a homework submission (runs in background).
 * @param {string} submissionId
 */
export async function transcribeHomeworkSubmission(submissionId) {
  const sub = await Submission.findById(submissionId)
  if (!sub?.attempt?.mistakes?.length) return

  const hasAudio = sub.attempt.mistakes.some((m) => /^https?:\/\//i.test(m.userAnswer ?? ""))
  if (!hasAudio) return

  const mistakes = await transcribeMistakes(sub.attempt.mistakes)
  sub.attempt = { ...(sub.attempt.toObject?.() ?? sub.attempt), mistakes }
  sub.markModified("attempt")
  await sub.save()
}

/**
 * Transcribe speaking recordings for a progress-test step (runs in background).
 * @param {string} submissionId
 * @param {number} stepIndex
 */
export async function transcribeControlWorkStep(submissionId, stepIndex) {
  const sub = await ControlWorkSubmission.findById(submissionId)
  const stepResult = sub?.stepResults?.[stepIndex]
  const mistakes = stepResult?.attempt?.mistakes
  if (!mistakes?.length) return

  const hasAudio = mistakes.some((m) => /^https?:\/\//i.test(m.userAnswer ?? ""))
  if (!hasAudio) return

  const transcribed = await transcribeMistakes(mistakes)
  sub.stepResults[stepIndex].attempt = {
    ...stepResult.attempt,
    mistakes: transcribed,
  }
  sub.markModified("stepResults")
  await sub.save()
}
