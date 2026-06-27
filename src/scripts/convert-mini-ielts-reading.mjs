/**
 * Converts mini-ielts reading JSON exports into Learnix IeltsReadingTest files.
 *
 * Usage:
 *   node src/scripts/convert-mini-ielts-reading.mjs [sourceDir] [outputDir]
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCE = "d:/Downloads/reading"
const DEFAULT_OUTPUT = path.resolve(__dirname, "../../../exercises/ielts/reading")

function slugify(title, testId) {
  const base = String(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${testId}-${base || "reading"}`
}

function cleanText(value) {
  if (value == null) return ""
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/ Show workspace$/i, "")
    .trim()
}

function getAnswer(test, number, question) {
  const direct = question?.answer
  if (direct != null && String(direct).trim() !== "") return cleanText(direct)
  const fromMap = test.answers?.[String(number)] ?? test.answers?.[number]
  if (fromMap != null && String(fromMap).trim() !== "") return cleanText(fromMap)
  return null
}

function dedupeQuestions(questions) {
  const byNum = new Map()
  for (const q of questions ?? []) {
    if (q.number == null) continue
    if (!byNum.has(q.number)) byNum.set(q.number, q)
  }
  return [...byNum.values()].sort((a, b) => a.number - b.number)
}

function isRomanNumeral(value) {
  return /^[ivxlcdm]+$/i.test(String(value).trim())
}

function inferSectionKind(section) {
  const type = cleanText(section.question_type)
  const instructions = cleanText(section.instructions)
  const lower = `${type} ${instructions}`.toLowerCase()

  if (type === "Unknown") {
    if (section.headings_options?.length || /heading/i.test(instructions)) return "matching-headings"
    if (/paragraph/i.test(instructions) && section.questions?.some((q) => /paragraph/i.test(q.context_before ?? q.label ?? ""))) {
      return "matching-headings"
    }
    return "fill-in-blank"
  }
  if (/true\s*\/\s*false/i.test(type)) return "true-false-not-given"
  if (/yes\s*\/\s*no/i.test(type)) return "yes-no-not-given"
  if (/multiple choice/i.test(type)) return "multiple-choice"
  if (/matching headings/i.test(type)) return "matching-headings"
  if (/matching information/i.test(type)) return "matching-information"
  if (/completion|sentence completion/i.test(type)) return "fill-in-blank"
  if (/short answer/i.test(type)) return "short-answer"
  return "fill-in-blank"
}

function buildHeadingOptions(section) {
  const seen = new Map()
  for (const h of section.headings_options ?? []) {
    const key = cleanText(h.key)
    const text = cleanText(h.text)
    if (key && text && !seen.has(key)) seen.set(key, `${key}. ${text}`)
  }
  return [...seen.values()]
}

function collectSectionOptions(section) {
  const byLetter = new Map()
  for (const q of section.questions ?? []) {
    for (const opt of q.options ?? []) {
      const letter = cleanText(opt.letter)
      const text = cleanText(opt.text)
      if (!letter) continue
      if (text && !/^E\s/.test(text) && text.length > 1) {
        byLetter.set(letter, text)
      }
    }
  }
  return byLetter
}

function extractStatementFromBrokenOptions(question) {
  for (const opt of question.options ?? []) {
    const text = cleanText(opt.text)
    const match = text.match(/^E\s+(.+)/)
    if (match) return cleanText(match[1])
  }
  return ""
}

function buildFillQuestionText(question) {
  const before = cleanText(question.context_before)
  const after = cleanText(question.context_after)
  if (before || after) {
    const gap = " ______ "
    if (before && after) return `${before}${gap}${after}`
    if (before) return `${before}${gap}`
    return `${gap}${after}`
  }
  return cleanText(question.statement || question.question || question.label)
}

function buildQuestion(section, question, test, kind) {
  const number = question.number
  const answer = getAnswer(test, number, question)
  if (!answer) return null

  if (kind === "true-false-not-given" || kind === "yes-no-not-given") {
    const text = cleanText(question.statement || question.question)
    if (!text) return null
    return { id: number, type: kind, question: text, correctAnswer: answer.toUpperCase() }
  }

  if (kind === "matching-headings") {
    const label = cleanText(question.label || question.context_before || `Question ${number}`)
    const options = buildHeadingOptions(section)
    if (options.length > 0) {
      return {
        id: number,
        type: "multiple-choice",
        question: label,
        options,
        correctAnswer: answer.toLowerCase(),
      }
    }
    return {
      id: number,
      type: "fill-in-blank",
      question: label,
      correctAnswer: answer.toLowerCase(),
    }
  }

  if (kind === "matching-information") {
    const text = cleanText(question.question || question.statement || question.label)
    if (!text) return null
    return { id: number, type: "short-answer", question: text, correctAnswer: answer.toUpperCase() }
  }

  if (kind === "multiple-choice") {
    const sectionOptions = collectSectionOptions(section)
    let text = cleanText(question.statement || question.question)
    if (!text) text = extractStatementFromBrokenOptions(question)
    if (!text && section.instructions) {
      const instr = cleanText(section.instructions)
      const mcMatch = instr.match(/^\d+\.\s*(.+)/)
      if (mcMatch && number <= 4) text = cleanText(mcMatch[1])
    }
    if (!text) text = `Question ${number}`

    const options =
      (question.options ?? [])
        .map((o) => {
          const letter = cleanText(o.letter)
          const optText = cleanText(o.text)
          if (!letter) return null
          const body = optText || sectionOptions.get(letter) || ""
          if (!body || /^E\s/.test(body)) return null
          return `${letter}. ${body}`
        })
        .filter(Boolean)

    const normalizedOptions = options.length ? options : [...sectionOptions.entries()].map(([l, t]) => `${l}. ${t}`)

    if (normalizedOptions.length >= 2) {
      return {
        id: number,
        type: "multiple-choice",
        question: text,
        options: normalizedOptions,
        correctAnswer: answer.toUpperCase(),
      }
    }

    return { id: number, type: "short-answer", question: text, correctAnswer: answer.toUpperCase() }
  }

  const text = buildFillQuestionText(question)
  if (!text) return null
  return { id: number, type: "fill-in-blank", question: text, correctAnswer: answer }
}

function buildSubtitle(parts) {
  const types = new Set()
  let count = 0
  for (const part of parts) {
    count += part.questions.length
    for (const q of part.questions) {
      if (q.type === "true-false-not-given") types.add("T/F/NG")
      else if (q.type === "yes-no-not-given") types.add("Y/N/NG")
      else if (q.type === "multiple-choice") types.add("Multiple choice")
      else if (q.type === "fill-in-blank") types.add("Gap fill")
      else if (q.type === "short-answer") types.add("Short answer")
    }
  }
  const label = [...types].slice(0, 2).join(" · ") || "Reading"
  return `${label} · ${count} questions`
}

function convertTest(raw) {
  const parts = []
  let partNumber = 0

  for (const section of raw.sections ?? []) {
    const kind = inferSectionKind(section)
    const questions = dedupeQuestions(section.questions)
      .map((q) => buildQuestion(section, q, raw, kind))
      .filter(Boolean)

    if (questions.length === 0) continue

    partNumber += 1
    const range = cleanText(section.question_range) || `Questions ${questions[0].id}–${questions[questions.length - 1].id}`

    parts.push({
      partNumber,
      title: range.replace(/^Questions\s*/i, "Part ") || `Part ${partNumber}`,
      instruction: `Read the passage and answer ${range.toLowerCase()}.`,
      passageTitle: raw.title,
      questionInstruction: cleanText(section.instructions),
      passage: raw.passage,
      totalQuestions: questions.length,
      questions,
    })
  }

  if (parts.length === 0) return null

  const questionCount = parts.reduce((sum, p) => sum + p.questions.length, 0)
  const id = slugify(raw.title, raw.test_id)

  return {
    test: {
      id,
      title: raw.title,
      totalTimeMinutes: Math.max(15, Math.min(60, Math.round(questionCount * 1.5))),
      parts,
    },
    catalog: {
      id,
      title: raw.title,
      subtitle: buildSubtitle(parts),
      estimatedMinutes: Math.max(15, Math.min(60, Math.round(questionCount * 1.5))),
      questionCount,
      file: `${id}.json`,
    },
  }
}

function loadSourceTests(sourceDir) {
  const files = fs
    .readdirSync(sourceDir)
    .filter((f) => f.endsWith(".json") && !/\(\d+\)/.test(f) && f !== "all_tests.json" && f !== "margaret_preston_reading_test.json")

  const byId = new Map()
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(sourceDir, file), "utf8"))
    if (!raw.test_id) continue
    if (!byId.has(raw.test_id)) byId.set(raw.test_id, raw)
  }
  return [...byId.values()].sort((a, b) => a.test_id - b.test_id)
}

function main() {
  const sourceDir = process.argv[2] ?? DEFAULT_SOURCE
  const outputDir = process.argv[3] ?? DEFAULT_OUTPUT

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`)
    process.exit(1)
  }

  fs.mkdirSync(outputDir, { recursive: true })

  const sources = loadSourceTests(sourceDir)
  const catalogItems = []
  const skipped = []

  for (const raw of sources) {
    const converted = convertTest(raw)
    if (!converted) {
      skipped.push({ test_id: raw.test_id, title: raw.title, reason: "no valid questions" })
      continue
    }

    const outPath = path.join(outputDir, converted.catalog.file)
    fs.writeFileSync(outPath, `${JSON.stringify(converted.test, null, 2)}\n`, "utf8")
    catalogItems.push(converted.catalog)
  }

  // Keep marie-curie example if present
  const mariePath = path.join(outputDir, "marie-curie-part1.json")
  if (fs.existsSync(mariePath) && !catalogItems.some((i) => i.id === "marie-curie-part1")) {
    const marie = JSON.parse(fs.readFileSync(mariePath, "utf8"))
    const qCount = marie.parts?.reduce((s, p) => s + (p.questions?.length ?? 0), 0) ?? 0
    catalogItems.unshift({
      id: marie.id,
      title: marie.title,
      subtitle: `True / False / Not Given · ${qCount} questions`,
      estimatedMinutes: marie.totalTimeMinutes ?? 15,
      questionCount: qCount,
      file: "marie-curie-part1.json",
    })
  }

  catalogItems.sort((a, b) => a.title.localeCompare(b.title))

  fs.writeFileSync(
    path.join(outputDir, "index.json"),
    `${JSON.stringify({ items: catalogItems }, null, 2)}\n`,
    "utf8",
  )

  console.log(`Converted ${catalogItems.length} reading tests → ${outputDir}`)
  if (skipped.length) {
    console.log("Skipped:")
    for (const s of skipped) console.log(`  - [${s.test_id}] ${s.title}: ${s.reason}`)
  }
}

main()
