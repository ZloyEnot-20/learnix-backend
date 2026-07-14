/**
 * Fix broken Cambridge listening audio markers ("D??", etc.).
 * Find last valid number before the first broken value, then renumber
 * every subsequent audio / audio_track as +1, +2, ...
 * Known shared tracks (same valid marker twice in a row) keep one number.
 * Broken markers ("D??") never share — each gets the next number.
 *
 * Usage: node src/scripts/fix-cambridge-audio-tracks.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
const BACKEND_BOOK = path.join(ROOT, "src/data/books/cambridge-vocab-ielts-advanced.json")
const FRONT_BOOK = path.resolve(ROOT, "../learnix-front/data/books/cambridge-vocab-ielts-advanced.json")
const LOG = path.join(ROOT, "src/scripts/fix-cambridge-audio-tracks.log")

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Parse "02", "D09", "09" → number; "D??" / garbage → null */
function parseTrack(v) {
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
  if (target.audio_track == null && target.audio == null) target.audio_track = formatted
}

/**
 * Collect every object that carries audio / audio_track, in book order.
 * Exercise markers first; section-level only if no exercise in the section
 * already has audio (section mirror fields are synced afterwards).
 */
function collect(book) {
  const out = []
  for (const unit of book.units ?? []) {
    for (const section of unit.sections ?? []) {
      const exercises = section.exercises ?? []
      let exerciseHasAudio = false
      for (const ex of exercises) {
        if (!isRecord(ex)) continue
        if (ex.audio_track == null && ex.audio == null) continue
        exerciseHasAudio = true
        out.push({
          unit: unit.unit_number,
          section: section.title || section.section_type || "",
          id: String(ex.exercise_id ?? ""),
          target: ex,
        })
      }
      if (!exerciseHasAudio && (section.audio_track != null || section.audio != null)) {
        out.push({
          unit: unit.unit_number,
          section: section.title || section.section_type || "",
          id: "(section)",
          target: section,
        })
      }
    }
  }
  return out
}

/** Mirror first exercise audio onto section.audio_track when both exist. */
function syncSectionMirrors(book) {
  const synced = []
  for (const unit of book.units ?? []) {
    for (const section of unit.sections ?? []) {
      if (section.audio_track == null && section.audio == null) continue
      const first = (section.exercises ?? []).find(
        (ex) => isRecord(ex) && (ex.audio != null || ex.audio_track != null),
      )
      if (!first) continue
      const v = first.audio_track ?? first.audio
      const before = valueOf(section)
      setValue(section, String(v))
      if (before !== String(v)) {
        synced.push(`U${unit.unit_number} section ${section.title || section.section_type}: ${before} → ${v}`)
      }
    }
  }
  return synced
}

function fix(book) {
  const list = collect(book)
  const lines = []
  lines.push(`Found ${list.length} audio markers`)

  let firstBad = -1
  let lastGood = null
  for (let i = 0; i < list.length; i++) {
    const n = parseTrack(valueOf(list[i].target))
    if (n == null) {
      firstBad = i
      break
    }
    lastGood = n
  }

  if (firstBad < 0) {
    lines.push("No broken tracks.")
    const synced = syncSectionMirrors(book)
    if (synced.length) {
      lines.push("Synced section mirrors:")
      lines.push(...synced.map((s) => `  ${s}`))
    }
    return { lines, changes: [] }
  }
  if (lastGood == null) throw new Error("Broken track before any valid number")

  lines.push(
    `Last valid: ${String(lastGood).padStart(2, "0")} at index ${firstBad - 1} (U${list[firstBad - 1]?.unit})`,
  )
  lines.push(
    `First broken: ${valueOf(list[firstBad].target)} at index ${firstBad} (U${list[firstBad].unit})`,
  )

  let dVotes = 0
  let total = 0
  for (let i = firstBad; i < list.length; i++) {
    total++
    if (/^D/i.test(valueOf(list[i].target) || "")) dVotes++
  }
  const preferD = dVotes >= total / 2

  const changes = []
  let next = lastGood
  let prevRaw = null
  let prevAssigned = null
  let prevWasValid = false

  for (let i = firstBad; i < list.length; i++) {
    const raw = valueOf(list[i].target)
    const rawValid = parseTrack(raw) != null
    let assigned

    // Share only when consecutive markers are the same *valid* track id
    // (e.g. D25, D25). Never share broken "D??" placeholders.
    if (prevWasValid && rawValid && prevRaw != null && raw === prevRaw && prevAssigned != null) {
      assigned = prevAssigned
    } else {
      next += 1
      assigned = formatTrack(next, preferD || /^D/i.test(raw || ""))
    }

    setValue(list[i].target, assigned)
    changes.push({
      unit: list[i].unit,
      section: list[i].section,
      id: list[i].id,
      before: raw,
      after: assigned,
    })
    prevRaw = raw
    prevAssigned = assigned
    prevWasValid = rawValid
  }

  lines.push(`Renumbered ${changes.length} markers:`)
  for (const c of changes) {
    lines.push(`  U${c.unit} [${c.id}] ${c.before} → ${c.after}`)
  }

  const synced = syncSectionMirrors(book)
  if (synced.length) {
    lines.push("Synced section mirrors:")
    for (const s of synced) lines.push(`  ${s}`)
  }

  const leftover = []
  for (const unit of book.units ?? []) {
    for (const section of unit.sections ?? []) {
      if (section.audio_track != null || section.audio != null) {
        if (parseTrack(valueOf(section)) == null) {
          leftover.push({ unit: unit.unit_number, id: "(section)", target: section })
        }
      }
      for (const ex of section.exercises ?? []) {
        if (!isRecord(ex)) continue
        if (ex.audio_track == null && ex.audio == null) continue
        if (parseTrack(valueOf(ex)) == null) {
          leftover.push({ unit: unit.unit_number, id: String(ex.exercise_id ?? ""), target: ex })
        }
      }
    }
  }
  if (leftover.length) {
    lines.push(`WARNING: ${leftover.length} broken markers remain`)
    for (const x of leftover) {
      lines.push(`  leftover U${x.unit} [${x.id}] ${valueOf(x.target)}`)
    }
  } else {
    lines.push("OK: no broken markers remain")
  }

  return { lines, changes }
}

function main() {
  const book = JSON.parse(fs.readFileSync(BACKEND_BOOK, "utf8"))
  const { lines, changes } = fix(book)
  fs.writeFileSync(LOG, lines.join("\n") + "\n")
  console.log(lines.join("\n"))
  if (changes.length === 0 && !lines.some((l) => l.startsWith("Synced"))) return

  const json = JSON.stringify(book, null, 2) + "\n"
  fs.writeFileSync(BACKEND_BOOK, json)
  fs.writeFileSync(FRONT_BOOK, json)
  console.log("Wrote backend + front book JSON")
}

main()
