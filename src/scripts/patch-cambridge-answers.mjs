/**
 * Inject answer_key values into exercise blanks / questions / sentences / answers.
 * Also remaps Unit 8 listening table blanks when AK length is 9 (OCR extras).
 *
 * Usage: node src/scripts/patch-cambridge-answers.mjs
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOK_PATH = path.resolve(__dirname, "../data/books/cambridge-vocab-ielts-advanced.json")
const FRONT_COPY = path.resolve(
  __dirname,
  "../../../learnix-front/data/books/cambridge-vocab-ielts-advanced.json",
)

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asStringArray(v) {
  if (!Array.isArray(v)) return []
  return v.map((x) => (x == null ? "" : String(x)))
}

/** U8 1.2: 9 AK values vs 7 printed blanks — map by table meaning. */
function mapU8Listening12(ak) {
  if (ak.length < 9) return null
  // Known AK:
  // 0 windows, 1 community, 2 Hilary Sharpe, 3 Lynne Denton,
  // 4 mayor, 5 phone, 6 road repair, 7 Member, 8 Parliament
  return {
    1: ak[0], // broken 1. ______
    2: ak[2], // officer - name: 2. ______
    3: ak[1], // secretary of the 3. ______
    4: ak[5], // Tel: 4. ______
    5: ak[7], // local 5. ______ of …
    6: ak[8], // … of 6. ______
    7: ak[6], // 7. ______ on Bramhurst Road
  }
}

function applyArrayAnswers(blanks, akArr) {
  if (!Array.isArray(blanks) || blanks.length === 0) return { filled: 0 }
  let filled = 0
  for (let i = 0; i < blanks.length; i++) {
    const b = blanks[i]
    if (!isRecord(b)) continue
    const byNumber = akArr[Number(b.number) - 1]
    const byIndex = akArr[i]
    const val = byNumber ?? byIndex
    if (val == null || String(val).trim() === "") continue
    if (b.answer == null || String(b.answer).trim() === "" || String(b.answer) === "null") {
      b.answer = String(val)
      filled++
    }
  }
  return { filled }
}

function applyObjectAnswers(items, akObj, valueKeys = ["answer"]) {
  if (!Array.isArray(items)) return { filled: 0 }
  let filled = 0
  for (const it of items) {
    if (!isRecord(it)) continue
    const num = it.number != null ? String(it.number) : it.letter != null ? String(it.letter) : null
    if (!num) continue
    const val = akObj[num] ?? akObj[num.toLowerCase()] ?? akObj[num.toUpperCase()]
    if (val == null || (typeof val !== "string" && typeof val !== "number")) continue
    for (const k of valueKeys) {
      if (it[k] == null || String(it[k]).trim() === "" || String(it[k]) === "null") {
        it[k] = String(val)
        filled++
        break
      }
    }
  }
  return { filled }
}

function patchExercise(ex, ak, unitNum, exerciseId) {
  const stats = { blanks: 0, questions: 0, sentences: 0, answers: 0, setAnswers: false }
  if (ak == null) return stats

  // Always attach full key for teacher / UI
  if (ex.answers == null) {
    ex.answers = structuredClone(ak)
    stats.setAnswers = true
  }

  if (Array.isArray(ak)) {
    const akArr = asStringArray(ak)
    // Special listening table remap
    if (String(unitNum) === "8" && String(exerciseId) === "1.2") {
      const map = mapU8Listening12(akArr)
      if (map && Array.isArray(ex.blanks)) {
        for (const b of ex.blanks) {
          if (!isRecord(b)) continue
          const n = Number(b.number)
          if (map[n] != null) {
            b.answer = map[n]
            stats.blanks++
          }
        }
        return stats
      }
    }
    stats.blanks += applyArrayAnswers(ex.blanks, akArr).filled
    if (Array.isArray(ex.questions)) {
      for (let i = 0; i < ex.questions.length; i++) {
        const q = ex.questions[i]
        if (!isRecord(q)) continue
        const val = akArr[Number(q.number) - 1] ?? akArr[i]
        if (val == null) continue
        if (q.answer == null || String(q.answer).trim() === "") {
          q.answer = val
          stats.questions++
        }
      }
    }
    if (Array.isArray(ex.sentences)) {
      for (let i = 0; i < ex.sentences.length; i++) {
        const s = ex.sentences[i]
        if (!isRecord(s)) continue
        const val = akArr[Number(s.number) - 1] ?? akArr[i]
        if (val == null) continue
        if (s.answer == null || String(s.answer).trim() === "") {
          s.answer = val
          stats.sentences++
        }
      }
    }
    if (Array.isArray(ex.items)) {
      for (let i = 0; i < ex.items.length; i++) {
        const it = ex.items[i]
        if (!isRecord(it)) continue
        const val = akArr[Number(it.number) - 1] ?? akArr[i]
        if (val == null) continue
        if (it.answer == null || String(it.answer).trim() === "") {
          it.answer = val
          stats.items++
        }
      }
    }
  } else if (isRecord(ak)) {
    stats.blanks += applyObjectAnswers(ex.blanks, ak).filled
    stats.questions += applyObjectAnswers(ex.questions, ak).filled
    stats.sentences += applyObjectAnswers(ex.sentences, ak).filled
    stats.items += applyObjectAnswers(ex.items, ak).filled
    // letter→number maps for matching etc. already on step.answers via lesson-flow
  }

  return stats
}

function walkUnit(unit, unitAk) {
  let total = { blanks: 0, questions: 0, sentences: 0, items: 0, setAnswers: 0, exercises: 0 }
  if (!isRecord(unitAk)) return total
  for (const section of unit.sections ?? []) {
    const list = Array.isArray(section.exercises) ? section.exercises : []
    const orphans = []
    if ((!list || list.length === 0) && (section.exercise_id || section.instruction)) {
      orphans.push(section)
    }
    for (const ex of [...list, ...orphans]) {
      if (!isRecord(ex)) continue
      const id = String(ex.exercise_id ?? section.exercise_id ?? "")
      if (!id) continue
      const ak = unitAk[id]
      if (ak == null) continue
      const s = patchExercise(ex, ak, unit.unit_number, id)
      total.blanks += s.blanks
      total.questions += s.questions
      total.sentences += s.sentences
      total.items += s.items
      if (s.setAnswers) total.setAnswers++
      total.exercises++
    }
  }
  return total
}

async function main() {
  const raw = JSON.parse(await fs.readFile(BOOK_PATH, "utf8"))
  const akRoot = raw.answer_key ?? {}
  const summary = {
    units: 0,
    blanks: 0,
    questions: 0,
    sentences: 0,
    items: 0,
    setAnswers: 0,
    exercises: 0,
    remainingNullBlanks: 0,
  }

  for (const unit of raw.units ?? []) {
    const unitAk = akRoot[`unit_${unit.unit_number}`]
    const s = walkUnit(unit, unitAk)
    summary.units++
    summary.blanks += s.blanks
    summary.questions += s.questions
    summary.sentences += s.sentences
    summary.items += s.items
    summary.setAnswers += s.setAnswers
    summary.exercises += s.exercises
  }

  // Count remaining null blanks
  for (const unit of raw.units ?? []) {
    for (const section of unit.sections ?? []) {
      for (const ex of section.exercises ?? []) {
        for (const b of ex.blanks ?? []) {
          if (b?.answer == null || String(b.answer).trim() === "" || String(b.answer) === "null") {
            summary.remainingNullBlanks++
          }
        }
      }
    }
  }

  const text = `${JSON.stringify(raw, null, 2)}\n`
  await fs.writeFile(BOOK_PATH, text, "utf8")
  try {
    await fs.writeFile(FRONT_COPY, text, "utf8")
  } catch {
    // front copy optional
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
