/**
 * Re-converts mini-ielts reading exports with question texts fetched from
 * solution pages when the source JSON is incomplete.
 *
 * Usage:
 *   node src/scripts/fix-and-reconvert-ielts-reading.mjs [sourceDir] [outputDir]
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { setServers } from "node:dns"

setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCE = "d:/Downloads/reading"
const DEFAULT_OUTPUT = path.resolve(__dirname, "../../../exercises/ielts/reading")

const FETCH_DELAY_MS = 400

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cleanText(value) {
  if (value == null) return ""
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/ Show workspace$/i, "")
    .trim()
}

function stripHtml(html) {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/h\d>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&#8211;/g, "–")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"'),
  )
}

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

function isPlaceholderQuestion(text) {
  const t = cleanText(text)
  if (!t) return true
  if (/^[A-J]$/i.test(t)) return true
  if (/^Question \d+$/i.test(t)) return true
  return false
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

function extractQuestionBlocks(text) {
  const blocks = []
  const re =
    /Questions?\s+(\d+)\s*[-–]\s*(\d+)([\s\S]*?)(?=Questions?\s+\d+\s*[-–]|Other Tests|$)/gi
  let m
  while ((m = re.exec(text)) !== null) {
    blocks.push({ start: Number(m[1]), end: Number(m[2]), body: m[3] })
  }
  return blocks
}

function parseHeadingOptionsFromBlock(body) {
  const start = body.indexOf("List of Headings")
  if (start === -1) return []
  const after = body.slice(start + "List of Headings".length)
  const endMatch = after.match(/\s+\d+\s+i\s+ii\s+iii/i) ?? after.match(/\s+Example\s+Paragraph/i)
  const chunk = endMatch ? after.slice(0, endMatch.index) : after
  const options = []
  const re =
    /\b((?:i{1,3}|iv|v|vi{0,3}|ix|x))\.\s+(.+?)(?=\s+(?:i{1,3}|iv|v|vi{0,3}|ix|x)\.\s+|$)/gi
  let m
  while ((m = re.exec(chunk)) !== null) {
    const key = m[1].toLowerCase()
    const headingText = cleanText(m[2])
    if (headingText && headingText !== "." && !options.some((h) => h.startsWith(`${key}.`))) {
      options.push(`${key}. ${headingText}`)
    }
  }
  return options
}

function parsePeopleOptions(body) {
  const markers = [
    "List of People and organisations",
    "List of People and Organisations",
    "List of people below",
    "List of People",
    "List of Organisations",
  ]
  let start = -1
  let markerLen = 0
  for (const marker of markers) {
    const idx = body.lastIndexOf(marker)
    if (idx > start) {
      start = idx
      markerLen = marker.length
    }
  }
  if (start === -1) return []

  const chunk = body.slice(start + markerLen)
  const options = []
  const entries = [...chunk.matchAll(/\b([A-F])\s+([A-Za-z][^]*?)(?=\s+[A-F]\s+[A-Za-z]|$)/g)]
  for (const em of entries) {
    const letter = em[1]
    const name = cleanText(em[2])
    if (name.length >= 3 && name.length < 80 && !/boxes|answer sheet/i.test(name)) {
      if (!options.some((o) => o.startsWith(`${letter}.`))) {
        options.push(`${letter}. ${name}`)
      }
    }
  }
  return options
}

function parseSolutionPage(text) {
  const result = {
    statements: new Map(),
    answers: new Map(),
    headingOptions: [],
    peopleOptions: [],
    mcOptions: new Map(),
  }

  const blocks = extractQuestionBlocks(text)

  for (const block of blocks) {
    const body = block.body

    // Matching information / paragraph / people rows
    const letterRow =
      /(\d+)\s+(?:(?:[A-J]\s+){2,}[A-J])\s+(.+?)Answer:\s*([A-Z]+(?:\s*,\s*[A-Z]+)?(?:\s+IN\s+ANY\s+ORDERS?)?)/gi
    let m
    while ((m = letterRow.exec(body)) !== null) {
      const num = Number(m[1])
      if (num < block.start || num > block.end) continue
      const statement = cleanText(m[2])
      const answer = cleanText(m[3])
        .toUpperCase()
        .replace(/\s+IN\s+ANY\s+ORDERS?/i, "")
        .trim()
      if (statement && !/^Paragraph\s+[A-G]$/i.test(statement)) {
        result.statements.set(num, statement)
      }
      result.answers.set(num, answer)
    }

    // Yes/No/Not Given
    const yn = /(\d+)\s+YES\s*NO\s*NOT\s*GIVEN\s+(.+?)Answer:\s*(YES|NO|NOT\s*GIVEN)/gi
    while ((m = yn.exec(body)) !== null) {
      const num = Number(m[1])
      if (num < block.start || num > block.end) continue
      result.statements.set(num, cleanText(m[2]))
      result.answers.set(num, cleanText(m[3]).toUpperCase().replace(/\s+/g, " "))
    }

    // True/False/Not Given
    const tf = /(\d+)\s+TRUE\s*\.?\s*FALSE\s*\.?\s*NOT\s*GIVEN\s*\.?\s*(.+?)Answer:\s*(TRUE|FALSE|NOT\s*GIVEN)/gi
    while ((m = tf.exec(body)) !== null) {
      const num = Number(m[1])
      if (num < block.start || num > block.end) continue
      result.statements.set(num, cleanText(m[2]))
      result.answers.set(num, cleanText(m[3]).toUpperCase().replace(/\s+/g, " "))
    }

    const headings = parseHeadingOptionsFromBlock(body)
    if (headings.length > result.headingOptions.length) {
      result.headingOptions = headings
    }

    const headingQ =
      /(\d+)\s+(?:(?:i{1,3}|iv|v|vi{0,3}|ix|x)\s+)+Paragraph\s+([A-G])\s*Answer:\s*((?:i{1,3}|iv|v|vi{0,3}|ix|x))/gi
    while ((m = headingQ.exec(body)) !== null) {
      const num = Number(m[1])
      if (num < block.start || num > block.end) continue
      result.statements.set(num, `Paragraph ${m[2].toUpperCase()}`)
      result.answers.set(num, m[3].toLowerCase())
    }

    // Summary / note completion gaps: "... text 8 Answer: value"
    const summaryGap =
      /(.{10,300}?)\s+(\d+)\s+Answer:\s*([^.\d].+?)(?=\.|(?:\s+\d+\s+Answer:)|$)/gi
    while ((m = summaryGap.exec(body)) !== null) {
      const num = Number(m[2])
      if (num < block.start || num > block.end) continue
      let prefix = cleanText(m[1])
      const sentences = prefix.split(/(?<=[.!?])\s+/)
      prefix = cleanText(sentences[sentences.length - 1] || prefix)
      const statement = `${prefix} ______`
      const answer = cleanText(m[3])
      if (statement.length <= 300) {
        result.statements.set(num, statement)
        result.answers.set(num, answer)
      }
    }

    // Sentence completion with numbered dots: "6. text Answer: value"
    const fill = /(\d+)\.\s+(.+?)Answer:\s*(.+?)(?=\d+\.\s+|$)/gi
    while ((m = fill.exec(body)) !== null) {
      const num = Number(m[1])
      if (num < block.start || num > block.end) continue
      let statement = cleanText(m[2])
      const answer = cleanText(m[3]).replace(/\s+IN\s+ANY\s+ORDERS?/i, "").trim()
      if (/YES|NOT GIVEN|TRUE|FALSE/i.test(answer) && answer.includes(" ")) continue
      statement = statement.replace(new RegExp(`\\b${num}\\b`, "g"), "______")
      result.statements.set(num, statement)
      result.answers.set(num, answer)
    }

    const mc =
      /Choose the correct letter[\s\S]*?([A-D])\.\s+(.+?)\s+([A-D])\.\s+(.+?)\s+([A-D])\.\s+(.+?)\s+([A-D])\.\s+(.+?)Answer:\s*([A-D])/i
    const mcMatch = body.match(mc)
    if (mcMatch) {
      const options = [
        `A. ${cleanText(mcMatch[2])}`,
        `B. ${cleanText(mcMatch[4])}`,
        `C. ${cleanText(mcMatch[6])}`,
        `D. ${cleanText(mcMatch[8])}`,
      ]
      const qText = cleanText(body.match(/(Which[\s\S]+?)\s*A\./i)?.[1] ?? "Choose the correct answer.")
      const numMatch = body.match(/box\s+(\d+)/i)
      const num = numMatch ? Number(numMatch[1]) : block.end
      if (num >= block.start && num <= block.end) {
        result.statements.set(num, qText)
        result.answers.set(num, mcMatch[9].toUpperCase())
        result.mcOptions.set(num, options)
      }
    }

    const multiSelect = body.match(
      /Which\s+THREE[\s\S]*?\bA\s+(.+?)\s+1?\s*B\s+(.+?)\s+1?\s*C\s+(.+?)\s+1?\s*D\s+(.+?)\s+1?\s*E\s+(.+?)\s+1?\s*F\s+(.+?)(?:\d+\.\s*Answer:\s*([A-F,\s]+))/i,
    )
    if (multiSelect) {
      const options = [
        `A. ${cleanText(multiSelect[1])}`,
        `B. ${cleanText(multiSelect[2])}`,
        `C. ${cleanText(multiSelect[3])}`,
        `D. ${cleanText(multiSelect[4])}`,
        `E. ${cleanText(multiSelect[5])}`,
        `F. ${cleanText(multiSelect[6])}`,
      ]
      const qText = cleanText(body.match(/(Which THREE[\s\S]+?)\s*1?\s*A\s+/i)?.[1] ?? "Choose THREE answers.")
      const answerLetters = (multiSelect[7] ?? "C, D, E")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-F]$/.test(s))
      for (let num = block.start; num <= block.end; num++) {
        result.statements.set(num, qText)
        result.answers.set(num, answerLetters.join(", "))
        result.mcOptions.set(num, options)
      }
    }

    const people = parsePeopleOptions(body)
    if (people.length > result.peopleOptions.length) {
      result.peopleOptions = people
    }
  }

  return result
}

async function fetchSolutionData(solutionUrl) {
  if (!solutionUrl) return null
  try {
    const res = await fetch(solutionUrl, {
      headers: { "User-Agent": "LearnixFixScript/1.0" },
    })
    if (!res.ok) return null
    const html = await res.text()
    return parseSolutionPage(stripHtml(html))
  } catch {
    return null
  }
}

function enrichTestFromSolution(raw, solution) {
  if (!solution) return raw

  const answers = { ...(raw.answers ?? {}) }
  for (const [num, ans] of solution.answers) {
    if (!answers[String(num)]) answers[String(num)] = ans
  }

  const sections = (raw.sections ?? []).map((section) => {
    const questions = dedupeQuestions(section.questions).map((q) => {
      const num = q.number
      const statement = solution.statements.get(num)
      const enriched = { ...q }

      if (statement) {
        if (isPlaceholderQuestion(q.question) || isPlaceholderQuestion(q.statement)) {
          enriched.question = statement
          enriched.statement = statement
        } else if (cleanText(q.question).startsWith("F ")) {
          enriched.question = statement
          enriched.statement = statement
        }
      }

      if (solution.peopleOptions.length >= 4 && inferSectionKind(section) === "multiple-choice") {
        enriched.options = solution.peopleOptions.map((text) => {
          const letter = text[0]
          return { letter, text: text.slice(3) }
        })
      }

      const mcOpts = solution.mcOptions.get(num)
      if (mcOpts?.length) {
        enriched.options = mcOpts.map((text) => {
          const letter = text[0]
          return { letter, text: text.slice(3) }
        })
      }

      const ans = solution.answers.get(num)
      if (ans) enriched.answer = ans

      return enriched
    })

    if (solution.headingOptions.length >= 3 && /heading/i.test(section.instructions ?? "")) {
      section = {
        ...section,
        headings_options: solution.headingOptions.map((text) => {
          const m = text.match(/^((?:i{1,3}|iv|v|vi{0,3}|ix|x))\.\s+(.+)$/i)
          return m ? { key: m[1].toLowerCase(), text: m[2] } : null
        }).filter(Boolean),
      }
    }

    return { ...section, questions }
  })

  return { ...raw, answers, sections }
}

function buildHeadingOptions(section, solution) {
  const seen = new Map()
  for (const h of section.headings_options ?? []) {
    const key = cleanText(h.key)
    const text = cleanText(h.text)
    if (key && text && text !== "." && text !== "-" && text !== "n boxes" && !seen.has(key)) {
      seen.set(key, `${key}. ${text}`)
    }
  }
  if (seen.size >= 3) return [...seen.values()]

  if (solution?.headingOptions?.length >= 3) return solution.headingOptions

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

function buildQuestion(section, question, test, kind, solution) {
  const number = question.number
  let answer = getAnswer(test, number, question)
  if (!answer && solution?.answers.has(number)) answer = solution.answers.get(number)
  if (!answer) return null

  const solutionStatement = solution?.statements.get(number)

  if (kind === "true-false-not-given" || kind === "yes-no-not-given") {
    const text = cleanText(question.statement || question.question || solutionStatement)
    if (!text || isPlaceholderQuestion(text)) return null
    return { id: number, type: kind, question: text, correctAnswer: answer.toUpperCase().replace(/\s+/g, " ") }
  }

  if (kind === "matching-headings") {
    const label = cleanText(question.label || question.context_before || solutionStatement || `Question ${number}`)
    const options = buildHeadingOptions(section, solution)
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
    let text = cleanText(solutionStatement || question.question || question.statement)
    if (isPlaceholderQuestion(text) && solutionStatement) text = cleanText(solutionStatement)
    if (!text || isPlaceholderQuestion(text) || text.length > 400) return null
    return { id: number, type: "short-answer", question: text, correctAnswer: answer.toUpperCase() }
  }

  if (kind === "multiple-choice") {
    const sectionOptions = collectSectionOptions(section)
    let text = cleanText(question.statement || question.question || solutionStatement)
    if (isPlaceholderQuestion(text)) text = cleanText(solutionStatement)
    if (!text) text = extractStatementFromBrokenOptions(question)
    if (text.startsWith("F ")) {
      const stripped = text.replace(/^F\s+/, "")
      if (stripped.length > 10) text = stripped
      else if (solutionStatement) text = solutionStatement
    }
    if (!text || isPlaceholderQuestion(text)) return null

    const solutionMc = solution?.mcOptions.get(number)
    const options =
      solutionMc ??
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

    const peopleOpts = solution?.peopleOptions ?? []
    const normalizedOptions =
      peopleOpts.length >= 2
        ? peopleOpts
        : options.length >= 2
          ? options
          : [...sectionOptions.entries()].map(([l, t]) => `${l}. ${t}`)

    const validOptions = normalizedOptions.filter(
      (o) => /^[A-F]\.\s+\S/.test(o) && !/boxes|answer sheet|List of/i.test(o),
    )

    const answerStr = String(answer)
    if (answerStr.includes(",")) {
      const letters = answerStr.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      if (validOptions.length >= 2 && letters.length >= 2) {
        return {
          id: number,
          type: "multiple-select",
          question: text,
          options: validOptions,
          correctAnswer: letters,
          selectCount: letters.length,
        }
      }
    }

    if (validOptions.length >= 2) {
      return {
        id: number,
        type: "multiple-choice",
        question: text,
        options: validOptions,
        correctAnswer: answer.toUpperCase(),
      }
    }

    return { id: number, type: "short-answer", question: text, correctAnswer: answer.toUpperCase() }
  }

  let text = buildFillQuestionText(question)
  if (solutionStatement && (isPlaceholderQuestion(text) || text.length > 300)) {
    text = solutionStatement
  } else if ((!text || isPlaceholderQuestion(text)) && solutionStatement) {
    text = solutionStatement
  }
  if (!text || text.length > 400) return null
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

function convertTest(raw, solution) {
  const parts = []
  let partNumber = 0

  for (const section of raw.sections ?? []) {
    const kind = inferSectionKind(section)
    const questions = dedupeQuestions(section.questions)
      .map((q) => buildQuestion(section, q, raw, kind, solution))
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

function validateTest(test, slug) {
  const issues = []
  for (const part of test.parts ?? []) {
    for (const q of part.questions ?? []) {
      const text = cleanText(q.question)
      if (!text) issues.push({ slug, id: q.id, problem: "empty question" })
      else if (/^[A-J]$/i.test(text)) issues.push({ slug, id: q.id, problem: "letter-only question", text })
      else if (/^Question \d+$/i.test(text)) issues.push({ slug, id: q.id, problem: "placeholder question", text })
      else if (text.length > 400) issues.push({ slug, id: q.id, problem: "corrupt long question", text: text.slice(0, 80) })
      if (q.type === "multiple-choice") {
        const opts = q.options ?? []
        if (opts.length < 2) issues.push({ slug, id: q.id, problem: "mc missing options" })
        else if (opts.some((o) => /boxes|answer sheet|List of/i.test(String(o)))) {
          issues.push({ slug, id: q.id, problem: "mc corrupt options" })
        }
      }
      if (q.correctAnswer == null || q.correctAnswer === "") {
        issues.push({ slug, id: q.id, problem: "missing answer" })
      }
    }
  }
  return issues
}

async function main() {
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
  const allIssues = []
  const solutionCache = new Map()

  for (const raw of sources) {
    let solution = null
    if (raw.solution_url) {
      if (!solutionCache.has(raw.solution_url)) {
        process.stdout.write(`Fetching solution for [${raw.test_id}] ${raw.title}...\n`)
        solutionCache.set(raw.solution_url, await fetchSolutionData(raw.solution_url))
        await sleep(FETCH_DELAY_MS)
      }
      solution = solutionCache.get(raw.solution_url)
    }

    const enriched = enrichTestFromSolution(raw, solution)
    const converted = convertTest(enriched, solution)
    if (!converted) {
      skipped.push({ test_id: raw.test_id, title: raw.title, reason: "no valid questions" })
      continue
    }

    const issues = validateTest(converted.test, converted.catalog.id)
    allIssues.push(...issues)

    const outPath = path.join(outputDir, converted.catalog.file)
    fs.writeFileSync(outPath, `${JSON.stringify(converted.test, null, 2)}\n`, "utf8")
    catalogItems.push(converted.catalog)
  }

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
  fs.writeFileSync(path.join(outputDir, "index.json"), `${JSON.stringify({ items: catalogItems }, null, 2)}\n`, "utf8")

  console.log(`\nConverted ${catalogItems.length} reading tests → ${outputDir}`)
  if (skipped.length) {
    console.log("\nSkipped:")
    for (const s of skipped) console.log(`  - [${s.test_id}] ${s.title}: ${s.reason}`)
  }
  if (allIssues.length) {
    console.log(`\nRemaining validation issues: ${allIssues.length}`)
    for (const issue of allIssues.slice(0, 30)) {
      console.log(`  - ${issue.slug} Q${issue.id}: ${issue.problem}${issue.text ? ` (${issue.text})` : ""}`)
    }
    if (allIssues.length > 30) console.log(`  ... and ${allIssues.length - 30} more`)
  } else {
    console.log("\nAll tests passed validation.")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
