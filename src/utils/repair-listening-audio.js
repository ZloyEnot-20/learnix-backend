/**
 * Repair broken Cambridge listening markers like "D??".
 * Walks audio / audio_track in book (or unit) order; after the last valid
 * number, renumbers subsequent markers sequentially (+1), keeping shared
 * consecutive *valid* duplicates as the same id.
 */

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export function parseListeningTrack(v) {
  if (v == null) return null
  const s = String(v).trim()
  const m = s.match(/^D?0*(\d+)$/i)
  if (!m) return null
  return Number(m[1])
}

function formatTrack(n, preferD) {
  const body = String(n).padStart(2, "0")
  return preferD ? `D${body}` : body
}

function valueOf(target) {
  if (target.audio_track != null) return String(target.audio_track)
  if (target.audio != null) return String(target.audio)
  return null
}

function setValue(target, formatted) {
  if (target.audio_track != null) target.audio_track = formatted
  if (target.audio != null) target.audio = formatted
}

function collectFromUnit(unit) {
  const out = []
  for (const section of unit?.sections ?? []) {
    const exercises = section.exercises ?? []
    let exerciseHasAudio = false
    for (const ex of exercises) {
      if (!isRecord(ex)) continue
      if (ex.audio_track == null && ex.audio == null) continue
      exerciseHasAudio = true
      out.push(ex)
    }
    if (!exerciseHasAudio && (section.audio_track != null || section.audio != null)) {
      out.push(section)
    }
  }
  return out
}

function collectFromBook(bookOrUnits) {
  const units = Array.isArray(bookOrUnits)
    ? bookOrUnits
    : Array.isArray(bookOrUnits?.units)
      ? bookOrUnits.units
      : []
  const out = []
  for (const unit of units) {
    out.push(...collectFromUnit(unit))
  }
  return out
}

function syncSectionMirrors(units) {
  for (const unit of units) {
    for (const section of unit?.sections ?? []) {
      if (section.audio_track == null && section.audio == null) continue
      const first = (section.exercises ?? []).find(
        (ex) => isRecord(ex) && (ex.audio != null || ex.audio_track != null),
      )
      if (!first) continue
      const v = first.audio_track ?? first.audio
      setValue(section, String(v))
    }
  }
}

/**
 * Mutates targets in place. Returns number of rewrites.
 * @param {object[] | object} bookOrUnits book doc `{ units }` or units array
 */
export function repairListeningAudioTracks(bookOrUnits) {
  const units = Array.isArray(bookOrUnits)
    ? bookOrUnits
    : Array.isArray(bookOrUnits?.units)
      ? bookOrUnits.units
      : []
  const list = collectFromBook(units)
  if (!list.length) return 0

  let firstBad = -1
  let lastGood = null
  for (let i = 0; i < list.length; i++) {
    const n = parseListeningTrack(valueOf(list[i]))
    if (n == null) {
      firstBad = i
      break
    }
    lastGood = n
  }

  if (firstBad < 0) {
    syncSectionMirrors(units)
    return 0
  }
  if (lastGood == null) return 0

  let dVotes = 0
  let total = 0
  for (let i = firstBad; i < list.length; i++) {
    total++
    if (/^D/i.test(valueOf(list[i]) || "")) dVotes++
  }
  const preferD = dVotes >= total / 2

  let next = lastGood
  let prevRaw = null
  let prevAssigned = null
  let prevWasValid = false
  let changes = 0

  for (let i = firstBad; i < list.length; i++) {
    const raw = valueOf(list[i])
    const rawValid = parseListeningTrack(raw) != null
    let assigned
    if (prevWasValid && rawValid && prevRaw != null && raw === prevRaw && prevAssigned != null) {
      assigned = prevAssigned
    } else {
      next += 1
      assigned = formatTrack(next, preferD || /^D/i.test(raw || ""))
    }
    if (raw !== assigned) changes++
    setValue(list[i], assigned)
    prevRaw = raw
    prevAssigned = assigned
    prevWasValid = rawValid
  }

  syncSectionMirrors(units)
  return changes
}

/**
 * Single-field display fallback: never show "D??" to the user.
 * Prefer a numeric parse; otherwise blank.
 */
export function displayListeningTrack(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || /\?/.test(s)) return null
  const n = parseListeningTrack(s)
  if (n == null) return s
  return /^D/i.test(s) ? `D${String(n).padStart(2, "0")}` : String(n).padStart(2, "0")
}
