/**
 * Build Cambridge Vocabulary for IELTS Advanced book JSON + vocab decks
 * from DeepSeek-extracted unit files in Downloads.
 *
 * Usage: node src/scripts/build-cambridge-book.mjs
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "../..")
const DOWNLOADS = "d:\\Downloads"

const BACKEND_BOOK = path.join(
  ROOT,
  "src/data/books/cambridge-vocab-ielts-advanced.json",
)
const FRONT_BOOK = path.resolve(
  ROOT,
  "../learnix-front/data/books/cambridge-vocab-ielts-advanced.json",
)
const VOCAB_DECKS = path.join(
  ROOT,
  "src/data/vocab/cambridge-unit-vocab-decks.json",
)
const TRANSLATIONS_PATH = path.join(
  ROOT,
  "src/data/vocab/cambridge-translations.json",
)

const UNIT_FILES = {
  1: ["deepseek_json_20260714_1a788e.json"],
  2: ["deepseek_json_20260714_38cfc5.json"],
  3: ["deepseek_json_20260714_1b66c1.json"],
  4: ["deepseek_json_20260714_782678.json"],
  5: ["deepseek_json_20260714_9852c0.json"],
  6: ["deepseek_json_20260714_a1a720.json"],
  7: ["deepseek_json_20260714_3e7b58.json"],
  8: ["deepseek_json_20260714_f731c2.json"],
  9: ["deepseek_json_20260714_6173a3.json"],
  10: ["deepseek_json_20260714_b2a5d2.json"],
  11: ["deepseek_json_20260714_ba319f.json"],
  12: ["deepseek_json_20260714_5770d5.json"],
  13: ["deepseek_json_20260714_f0353c.json"],
  14: ["deepseek_json_20260714_751a48.json"],
  15: ["deepseek_json_20260714_9ad4c5.json"],
  16: ["deepseek_json_20260714_49a586.json"],
  17: ["deepseek_json_20260714_cc08ac.json"],
  18: [
    "deepseek_json_20260714_7a1f9e.json",
    "deepseek_json_20260714_4c7bb5.json",
  ],
  19: ["deepseek_json_20260714_29340f.json"],
  20: ["deepseek_json_20260714_fa97c9.json"],
  21: ["deepseek_json_20260714_2cf4ec.json"],
  22: ["deepseek_json_20260714_fdc1c6.json"],
  23: ["deepseek_json_20260714_d9db3f.json"],
  24: ["deepseek_json_20260714_892412.json"],
  25: ["deepseek_json_20260714_dfe438.json"],
}

const ANSWER_KEY_FILE = "deepseek_json_20260714_deedab.json"
const WORDLIST_FILE = "deepseek_json_20260714_601dd0.json"
const TEST3_FILE = "deepseek_json_20260714_d939c0.json"
const TEST5_FILE = "deepseek_json_20260714_07f815.json"

const SKIP_TYPES = new Set(["crossword", "diagram_labels", "graph_vocabulary"])

const SKIP_INSTRUCTION_RE =
  /mind\s*map|photograph|pie\s*chart|look at the (graph|picture|pictures|chart|diagram)|look at pictures/i

const TEST_ONE_RE = /Test One/i

const POS_FROM_CATEGORY = {
  nouns: "noun",
  noun: "noun",
  adjectives: "adjective",
  adjective: "adjective",
  verbs: "verb",
  verb: "verb",
  phrases: "phrase",
  phrase: "phrase",
  adverbs: "adverb",
  adverb: "adverb",
}

/** @type {{ skippedExercises: number, unitsBuilt: number[], testOneQuestions: any[] | null }} */
const stats = {
  skippedExercises: 0,
  unitsBuilt: [],
  testOneQuestions: null,
}

/** Fix common invalid JSON escapes from AI-extracted sources (e.g. `\(`, `\^`). */
function sanitizeJsonText(raw) {
  return raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\")
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    try {
      return JSON.parse(raw)
    } catch (firstErr) {
      try {
        return JSON.parse(sanitizeJsonText(raw))
      } catch {
        throw firstErr
      }
    }
  } catch (err) {
    throw new Error(`Failed to read/parse ${filePath}: ${err.message}`)
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function downloadsPath(name) {
  return path.join(DOWNLOADS, name)
}

function shouldSkipExercise(ex) {
  if (!ex || typeof ex !== "object") return true
  const type = String(ex.type ?? "").toLowerCase()
  if (SKIP_TYPES.has(type)) return true
  if (ex.has_image === true || ex.has_graph === true) return true
  const text = `${ex.instruction ?? ""} ${ex.title ?? ""}`
  if (SKIP_INSTRUCTION_RE.test(text)) return true
  return false
}

function inferSectionType(sectionTitle, exercises) {
  const title = sectionTitle ?? ""
  if (/Test practice/i.test(title)) return "test_practice"
  if (/reading/i.test(title)) return "reading"
  if (/listening/i.test(title)) return "listening"
  if (/speaking/i.test(title)) return "speaking"
  if (/writing/i.test(title)) return "writing"

  const types = (exercises ?? []).map((e) => String(e?.type ?? "").toLowerCase())
  if (types.some((t) => t === "test_practice" || t === "listening_notes")) {
    return "test_practice"
  }
  if (
    types.some(
      (t) =>
        t === "reading_comprehension" ||
        t === "reading_passage" ||
        t === "reading" ||
        t === "tfng" ||
        t === "yes_no_ng",
    ) ||
    (exercises ?? []).some((e) => e?.passage && Array.isArray(e?.questions))
  ) {
    return "reading"
  }
  if (types.some((t) => t === "listening" || t === "listening_match")) return "listening"
  if (types.some((t) => t === "speaking" || t === "discussion" || t === "self-assessment")) {
    return "speaking"
  }
  if (types.some((t) => t === "writing")) return "writing"
  if (types.some((t) => t === "collocation" || t === "vocabulary" || t === "word_formation" || t === "gap_fill" || t === "paraphrase" || t === "matching")) {
    return "vocabulary"
  }
  // Prefer the human section title over a generic "vocabulary" bucket when unknown
  if (title.trim()) return "vocabulary"
  return "vocabulary"
}

function normalizeExercise(ex) {
  if (!ex || typeof ex !== "object") return null
  const { id, ...rest } = ex
  const out = { ...rest }
  if (id !== undefined && out.exercise_id === undefined) {
    out.exercise_id = id
  }
  return out
}

/**
 * Collect raw exercise-like objects from a source section.
 * Sections may use `exercises`, a single `exercise`, or top-level
 * `passage` + `questions` (test-practice reading).
 */
function collectRawExercises(section) {
  if (Array.isArray(section.exercises)) return [...section.exercises]
  if (section.exercise && typeof section.exercise === "object") {
    return [section.exercise]
  }
  // Reading test-practice with passage + question groups at section level
  if (section.passage && Array.isArray(section.questions)) {
    const exercises = []
    exercises.push({
      id: "reading_passage",
      type: "reading_passage",
      instruction:
        section.instruction ||
        "You should spend about 20 minutes on Questions which are based on the Reading Passage below.",
      title: section.title?.replace(/^Test Practice\s*[-–:]\s*/i, "").trim() || undefined,
      passage: section.passage,
      questions: [],
    })
    for (const q of section.questions) {
      exercises.push({
        ...q,
        passage: section.passage,
      })
    }
    return exercises
  }
  return []
}

function normalizeSection(section) {
  const title = section.title ?? ""
  const rawExercises = collectRawExercises(section)
  const exercises = []

  for (const ex of rawExercises) {
    if (shouldSkipExercise(ex)) {
      stats.skippedExercises += 1
      continue
    }
    const normalized = normalizeExercise(ex)
    if (normalized) exercises.push(normalized)
  }

  if (exercises.length === 0 && !section.passage) {
    return null
  }

  const sectionType = inferSectionType(title, exercises)
  const out = {
    section_type: sectionType,
  }

  if (title) out.title = title

  // Preserve useful section-level metadata
  for (const key of [
    "subtype",
    "audio_track",
    "audio",
    "instruction",
    "test_tip",
    "notes",
    "answers",
  ]) {
    if (section[key] !== undefined && out[key] === undefined) {
      out[key] = section[key]
    }
  }

  // Listening-style test_practice with a single exercise often stores
  // content on the exercise itself — promote common fields when helpful.
  if (
    sectionType === "test_practice" &&
    exercises.length === 1 &&
    !section.passage
  ) {
    const only = exercises[0]
    out.exercises = [only]
    if (only.instruction && !out.instruction) out.instruction = only.instruction
    if (only.audio && !out.audio_track) out.audio_track = only.audio
    if (only.notes && !out.notes) out.notes = only.notes
  } else if (exercises.length > 0) {
    out.exercises = exercises
  }

  // Subtype hint from title for test_practice
  if (sectionType === "test_practice" && title) {
    const m = title.match(/Test Practice\s*[-–:]\s*(.+)/i)
    if (m && !out.subtype) out.subtype = m[1].trim()
  }

  return out
}

function isTestOneSection(section) {
  return TEST_ONE_RE.test(section.title ?? "") || TEST_ONE_RE.test(section.type ?? "")
}

function extractTestOneQuestions(section) {
  const questions =
    section.questions ||
    section.exercises?.flatMap((e) => e.questions || []) ||
    []
  return questions.map((q) => ({
    number: q.number,
    text: q.text ?? q.statement ?? "",
    options: q.options ?? [],
    answer: q.answer ?? null,
  }))
}

function buildUnitFromSource(unitNumber, sourceParts) {
  const meta = sourceParts[0]?.unit ?? {}
  const allSections = []

  for (const part of sourceParts) {
    const sections = part.sections ?? []
    for (const section of sections) {
      if (isTestOneSection(section)) {
        const qs = extractTestOneQuestions(section)
        if (qs.length > 0) {
          stats.testOneQuestions = qs
        }
        continue
      }
      const normalized = normalizeSection(section)
      if (normalized) allSections.push(normalized)
    }
  }

  return {
    unit_number: unitNumber,
    title: meta.title ?? `Unit ${unitNumber}`,
    subtitle: meta.subtitle ?? undefined,
    pages: meta.pages ?? undefined,
    sections: allSections,
  }
}

function applyAnswerOverrides(questions, answers) {
  if (!Array.isArray(questions) || !Array.isArray(answers)) return questions
  return questions.map((q, i) => ({
    ...q,
    answer: answers[i] !== undefined ? answers[i] : q.answer,
  }))
}

function buildTests(deedab, test3Data, test5Data, unit5Pages) {
  const ak = deedab.answer_key ?? deedab
  const testOneAnswers = ak.test_one?.answers ?? []
  const testThreeAnswers = ak.test_three?.answers ?? []
  const testFiveAnswers = ak.test_five?.answers ?? []

  const tests = []

  // Test 1 from Unit 5 Test One section
  if (stats.testOneQuestions?.length) {
    tests.push({
      number: 1,
      title: "Test one",
      units: "1–5",
      pages: unit5Pages || "32-33",
      questions: applyAnswerOverrides(stats.testOneQuestions, testOneAnswers),
    })
  } else {
    console.warn("Warning: Test One questions not found in Unit 5; skipping Test 1.")
  }

  // Test 3 from file
  const t3 = test3Data.test ?? test3Data
  tests.push({
    number: t3.number ?? 3,
    title: t3.title ?? "Test three",
    units: t3.units ?? "11–15",
    pages: t3.pages ?? "84-85",
    questions: applyAnswerOverrides(
      (t3.questions ?? []).map((q) => ({
        number: q.number,
        text: q.text ?? "",
        options: q.options ?? [],
        answer: q.answer ?? null,
      })),
      testThreeAnswers,
    ),
  })

  // Test 5 from file
  const t5 = test5Data.test ?? test5Data
  tests.push({
    number: t5.number ?? 5,
    title: t5.title ?? "Test five",
    units: t5.units ?? "21–25",
    pages: t5.pages ?? "135-136",
    questions: applyAnswerOverrides(
      (t5.questions ?? []).map((q) => ({
        number: q.number,
        text: q.text ?? "",
        options: q.options ?? [],
        answer: q.answer ?? null,
      })),
      testFiveAnswers,
    ),
  })

  return tests
}

function slugifyTerm(term) {
  return String(term)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildVocabDecks(wordlistRoot, units, translations) {
  const wordlist = wordlistRoot.wordlist ?? wordlistRoot
  const decks = []
  let missingTranslations = 0

  for (let n = 1; n <= 25; n++) {
    const unitKey = `unit_${n}`
    const unitWords = wordlist[unitKey] ?? {}
    const unitMeta = units.find((u) => u.unit_number === n)
    const unitTitle = unitMeta?.title ?? `Unit ${n}`
    const words = []
    let wordIndex = 0

    for (const [category, entries] of Object.entries(unitWords)) {
      const pos = POS_FROM_CATEGORY[category] ?? category.replace(/s$/, "")
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        continue
      }
      for (const term of Object.keys(entries)) {
        wordIndex += 1
        const tr = translations?.[term]
        const translation = tr?.ru ?? ""
        const translationUz = tr?.uz ?? ""
        if (!translation && !translationUz) missingTranslations += 1

        words.push({
          id: `cambridge-unit-${n}-${slugifyTerm(term) || wordIndex}`,
          term,
          partOfSpeech: pos,
          definition: "",
          example: "",
          translation,
          translationUz,
        })
      }
    }

    decks.push({
      slug: `cambridge-unit-${n}`,
      title: `Unit ${n}: ${unitTitle}`,
      description: `Vocabulary from Cambridge Vocabulary for IELTS Advanced — Unit ${n}`,
      level: "C1",
      topic: unitTitle,
      difficulty: "hard",
      order: n,
      words,
    })
  }

  return { decks, missingTranslations }
}

/**
 * Map exercise_id → section title from source Downloads files.
 * Used to enrich curated units 1–3 that lack section titles.
 */
function exerciseTitleMapFromParts(sourceParts) {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const part of sourceParts) {
    for (const section of part.sections ?? []) {
      if (isTestOneSection(section)) continue
      const title = typeof section.title === "string" ? section.title.trim() : ""
      if (!title) continue
      for (const ex of collectRawExercises(section)) {
        if (shouldSkipExercise(ex)) continue
        const id = String(ex.id ?? ex.exercise_id ?? "")
        if (id) map.set(id, title)
      }
      if (/test practice/i.test(title)) {
        map.set("test_practice", title)
      }
    }
  }
  return map
}

function enrichCuratedUnitWithTitles(unit, titleByExerciseId) {
  const clone = structuredClone(unit)
  const newSections = []

  for (const section of clone.sections ?? []) {
    // Orphan / test_practice sections without nested exercises
    if (!Array.isArray(section.exercises) || section.exercises.length === 0) {
      if (!(typeof section.title === "string" && section.title.trim())) {
        const id =
          section.exercise_id ||
          (section.section_type === "test_practice" ? "test_practice" : null)
        let title = id && titleByExerciseId.get(String(id))
        if (!title && section.section_type === "test_practice") title = "Test practice"
        if (title) section.title = title
      }
      newSections.push(section)
      continue
    }

    // Split one curated section into multiple when exercise ids map to different
    // source titles (e.g. Character 1.x vs Psychology 2.x).
    // Prefer Downloads title map over a single curated section.title.
    /** @type {Array<{ title: string, exercises: any[] }>} */
    const groups = []
    for (const ex of section.exercises) {
      const id = String(ex?.exercise_id ?? "")
      let title = titleByExerciseId.get(id) || ""
      if (!title && id) {
        if (id.startsWith("1.")) title = "Character"
        else if (id.startsWith("2.")) title = "Psychology"
        else if (id.startsWith("3.")) title = "Psychology - Reading"
        else if (id === "test_practice" || id.startsWith("reading")) title = "Test practice"
        else if (id.startsWith("4.")) title = "Change"
      }
      if (!title) {
        title =
          (typeof section.title === "string" && section.title.trim()) ||
          (section.section_type === "reading" ? "Reading" : "Vocabulary")
      }
      const last = groups[groups.length - 1]
      if (last && last.title === title) last.exercises.push(ex)
      else groups.push({ title, exercises: [ex] })
    }

    for (const g of groups) {
      newSections.push({
        ...section,
        title: g.title,
        exercises: g.exercises,
      })
    }
  }

  clone.sections = newSections
  return clone
}

function formatExerciseRange(ids) {
  if (!ids.length) return ""
  if (ids.length === 1) return ids[0]
  return `${ids[0]}–${ids[ids.length - 1]}`
}

/** Rebuild top-level pages index: one page per section with real titles. */
function buildPagesIndex(units) {
  const pages = []
  let pageNum = 1
  for (const unit of units) {
    const unitNumber = Number(unit.unit_number)
    for (const section of unit.sections ?? []) {
      const ids = []
      if (Array.isArray(section.exercises)) {
        for (const ex of section.exercises) {
          if (ex?.exercise_id) ids.push(String(ex.exercise_id))
        }
      }
      if (section.exercise_id) ids.push(String(section.exercise_id))
      if (
        section.section_type === "test_practice" &&
        !ids.includes("test_practice") &&
        !Array.isArray(section.exercises)
      ) {
        ids.push("test_practice")
      }
      if (ids.length === 0) continue

      const title =
        (typeof section.title === "string" && section.title.trim()) ||
        (section.section_type === "test_practice"
          ? section.subtype
            ? `Test practice · ${section.subtype}`
            : "Test practice"
          : section.section_type === "reading"
            ? "Reading"
            : unit.title || `Unit ${unitNumber}`)

      const range = formatExerciseRange(ids)
      pages.push({
        page: pageNum++,
        unit: unitNumber,
        title: unit.title ?? `Unit ${unitNumber}`,
        label: range ? `${title} · ${range}` : title,
        exercise_ids: ids,
      })
    }
  }
  return pages
}

async function loadTranslations() {
  try {
    await fs.access(TRANSLATIONS_PATH)
    const data = await readJson(TRANSLATIONS_PATH)
    console.log(`Loaded translations from ${TRANSLATIONS_PATH}`)
    return data
  } catch {
    console.log(
      `No translations file at ${TRANSLATIONS_PATH} — using empty placeholders.`,
    )
    return {}
  }
}

async function main() {
  console.log("Building Cambridge Vocabulary for IELTS Advanced…")

  const existing = await readJson(BACKEND_BOOK)
  const deedab = await readJson(downloadsPath(ANSWER_KEY_FILE))
  const wordlist = await readJson(downloadsPath(WORDLIST_FILE))
  const test3Data = await readJson(downloadsPath(TEST3_FILE))
  const test5Data = await readJson(downloadsPath(TEST5_FILE))
  const translations = await loadTranslations()

  const answerKey = deedab.answer_key ?? deedab
  if (!answerKey || typeof answerKey !== "object") {
    throw new Error("deedab.answer_key is missing or invalid")
  }

  /** @type {any[]} */
  const units = []

  // Units 1–3: curated exercise content + section titles from Downloads
  const existingByNumber = new Map(
    (existing.units ?? []).map((u) => [u.unit_number, u]),
  )

  for (let n = 1; n <= 3; n++) {
    const files = UNIT_FILES[n]
    const parts = []
    for (const f of files) {
      parts.push(await readJson(downloadsPath(f)))
    }
    const titleMap = exerciseTitleMapFromParts(parts)

    if (existingByNumber.has(n)) {
      const enriched = enrichCuratedUnitWithTitles(
        existingByNumber.get(n),
        titleMap,
      )
      const meta = parts[0]?.unit ?? {}
      if (!enriched.subtitle && meta.subtitle) enriched.subtitle = meta.subtitle
      if (!enriched.pages && meta.pages) enriched.pages = meta.pages
      units.push(enriched)
      stats.unitsBuilt.push(n)
      console.log(`Unit ${n}: curated content + section titles from Downloads`)
    } else {
      console.warn(`Unit ${n}: missing in existing book — building from Downloads`)
      units.push(buildUnitFromSource(n, parts))
      stats.unitsBuilt.push(n)
    }
  }

  let unit5Pages = "32-33"

  for (let n = 4; n <= 25; n++) {
    const files = UNIT_FILES[n]
    if (!files?.length) {
      throw new Error(`No UNIT_FILES entry for unit ${n}`)
    }
    const parts = []
    for (const f of files) {
      const fp = downloadsPath(f)
      try {
        parts.push(await readJson(fp))
      } catch (err) {
        throw new Error(`Unit ${n}: cannot load ${f}: ${err.message}`)
      }
    }

    const unit = buildUnitFromSource(n, parts)
    if (n === 5) {
      unit5Pages = parts[0]?.unit?.pages || unit5Pages
    }
    units.push(unit)
    stats.unitsBuilt.push(n)
    const exCount = unit.sections.reduce(
      (acc, s) => acc + (s.exercises?.length ?? 0),
      0,
    )
    console.log(
      `Unit ${n}: ${unit.sections.length} sections, ${exCount} exercises` +
        (files.length > 1 ? ` (merged ${files.length} files)` : ""),
    )
  }

  if (!stats.testOneQuestions) {
    try {
      const u5 = await readJson(downloadsPath(UNIT_FILES[5][0]))
      const testSec = (u5.sections ?? []).find((s) => isTestOneSection(s))
      if (testSec) {
        stats.testOneQuestions = extractTestOneQuestions(testSec)
      }
    } catch (err) {
      console.warn(`Could not re-scan Unit 5 for Test One: ${err.message}`)
    }
  }

  const tests = buildTests(deedab, test3Data, test5Data, unit5Pages)
  const pages = buildPagesIndex(units)

  const bookOut = {
    book: existing.book ?? {
      title: "Cambridge Vocabulary for IELTS Advanced",
      author: "Pauline Cullen",
      isbn: "978-0-521-17922-5",
      publisher: "Cambridge University Press",
      year: 2012,
    },
    units,
    answer_key: answerKey,
    tests,
    pages,
  }

  await writeJson(BACKEND_BOOK, bookOut)
  await writeJson(FRONT_BOOK, bookOut)
  console.log(`Wrote book → ${BACKEND_BOOK}`)
  console.log(`Wrote book → ${FRONT_BOOK}`)
  console.log(`Pages index: ${pages.length} pages`)

  const { decks, missingTranslations } = buildVocabDecks(
    wordlist,
    units,
    translations,
  )
  await writeJson(VOCAB_DECKS, decks)
  console.log(`Wrote vocab decks → ${VOCAB_DECKS}`)

  const totalWords = decks.reduce((a, d) => a + d.words.length, 0)

  console.log("\n========== SUMMARY ==========")
  console.log(`Units built: ${stats.unitsBuilt.length} (${stats.unitsBuilt.join(", ")})`)
  console.log(`Skipped exercises: ${stats.skippedExercises}`)
  console.log(
    `Tests included: ${tests.map((t) => `Test ${t.number} (${t.questions.length} q)`).join(", ")}`,
  )
  console.log(`Pages: ${pages.length}`)
  console.log("Sample page labels:")
  for (const p of pages.slice(0, 12)) {
    console.log(`  p.${p.page} u${p.unit}: ${p.label}`)
  }
  console.log(`Vocab decks: ${decks.length}, total words: ${totalWords}`)
  console.log(`Missing translations (empty ru+uz): ${missingTranslations}`)
  console.log("=============================\n")
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
