/**
 * Debounced async recompute queue for student language profiles.
 * Follows the fire-and-forget pattern used by gamification and transcription.
 */

const pending = new Map()
const DEBOUNCE_MS = 2_000

/**
 * Schedule a profile recompute for a student. Multiple calls within the debounce
 * window are coalesced into a single run.
 *
 * @param {string} studentId
 */
export function scheduleRecomputeStudentLanguageProfile(studentId) {
  if (!studentId) return

  const existing = pending.get(studentId)
  if (existing?.timer) clearTimeout(existing.timer)

  const entry = pending.get(studentId) ?? { timer: null, running: false }
  entry.timer = setTimeout(async () => {
    entry.timer = null
    if (entry.running) {
      scheduleRecomputeStudentLanguageProfile(studentId)
      return
    }
    entry.running = true
    try {
      const { recomputeStudentLanguageProfile } = await import(
        "./studentLanguageProfile.service.js"
      )
      await recomputeStudentLanguageProfile(studentId)
    } catch (err) {
      console.error("[languageProfile] recompute failed", studentId, err)
    } finally {
      entry.running = false
      if (!entry.timer) pending.delete(studentId)
    }
  }, DEBOUNCE_MS)

  pending.set(studentId, entry)
}

/** Immediate recompute (for migrations / staff force). */
export async function recomputeStudentLanguageProfileNow(studentId) {
  const { recomputeStudentLanguageProfile } = await import(
    "./studentLanguageProfile.service.js"
  )
  return recomputeStudentLanguageProfile(studentId)
}

export async function recomputeStudentLanguageProfileBatch(studentIds) {
  const { recomputeStudentLanguageProfile } = await import(
    "./studentLanguageProfile.service.js"
  )
  for (const id of studentIds) {
    await recomputeStudentLanguageProfile(id).catch((err) => {
      console.error("[languageProfile] batch recompute failed", id, err)
    })
  }
}
