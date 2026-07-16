/**
 * Grade live-lesson student answers against book answer_key.
 * Returns percent score + per-item breakdown for the teacher panel.
 */

function isRecord(v) {
  return typeof v === "object" && v != null && !Array.isArray(v)
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
}

/**
 * Expand slash alternatives inside a phrase.
 * "contemporary/current/topical" → three full strings
 * "the past is a/another country" → "… a country" / "… another country"
 * Does NOT split on "/" when it would break mid-word incorrectly.
 */
function expandSlashAlternatives(phrase) {
  const raw = String(phrase ?? "").trim()
  if (!raw) return [""]
  if (!raw.includes("/")) return [raw]

  // Token with alternatives: word/word/word (no spaces around /)
  const tokenRe = /([^\s/]+(?:\/[^\s/]+)+)/g
  const parts = []
  let last = 0
  let match
  while ((match = tokenRe.exec(raw)) != null) {
    parts.push({ type: "text", value: raw.slice(last, match.index) })
    parts.push({ type: "alts", value: match[1].split("/") })
    last = match.index + match[1].length
  }
  parts.push({ type: "text", value: raw.slice(last) })

  let variants = [""]
  for (const part of parts) {
    if (part.type === "text") {
      variants = variants.map((v) => v + part.value)
    } else {
      const next = []
      for (const v of variants) {
        for (const alt of part.value) {
          next.push(v + alt)
        }
      }
      variants = next
    }
  }
  return variants.map((v) => v.trim()).filter(Boolean)
}

/** Strip optional parenthetical segments → core + optional combinations. */
function expandOptionalParens(phrase) {
  const raw = String(phrase ?? "").trim()
  if (!raw.includes("(")) return [raw]

  const optional = []
  const required = raw.replace(/\(([^)]+)\)/g, (_, inner) => {
    optional.push(String(inner).trim())
    return " "
  })
  const core = required.replace(/\s+/g, " ").trim()
  const out = new Set()
  if (core) out.add(core)
  // Full phrase without stripping
  out.add(raw.replace(/\s+/g, " ").trim())
  // core + each optional (before/after)
  for (const opt of optional) {
    if (core) {
      out.add(`${opt} ${core}`.replace(/\s+/g, " ").trim())
      out.add(`${core} ${opt}`.replace(/\s+/g, " ").trim())
    } else {
      out.add(opt)
    }
  }
  // All optionals inserted in place of parens (approximate: join with core)
  if (core && optional.length > 1) {
    out.add(`${core} ${optional.join(" ")}`.replace(/\s+/g, " ").trim())
    out.add(`${optional.join(" ")} ${core}`.replace(/\s+/g, " ").trim())
  }
  return [...out].filter(Boolean)
}

/** All acceptable surface forms for an answer-key entry. */
function expandExpectedForms(expected) {
  const forms = new Set()
  for (const slashVar of expandSlashAlternatives(expected)) {
    for (const parenVar of expandOptionalParens(slashVar)) {
      forms.add(normalize(parenVar))
    }
    forms.add(normalize(slashVar))
  }
  forms.add(normalize(expected))
  return [...forms].filter(Boolean)
}

/** Exact match of a student gap against an answer-key string. */
function matchesKey(given, expected) {
  const g = normalize(given)
  if (!g) return false
  return expandExpectedForms(expected).some((form) => g === form)
}

/**
 * Free-text / multi-phrase: expected expression appears in the student's notes.
 * Also accepts line/comma-separated tokens matching the expected form.
 */
function textContainsExpected(haystack, expected) {
  const h = normalize(haystack)
  if (!h) return false
  const forms = expandExpectedForms(expected)
  for (const form of forms) {
    if (!form) continue
    if (h === form) return true
    // Substring with soft word boundaries
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(?:^|[^a-z0-9'])${escaped}(?:[^a-z0-9']|$)`, "i")
    if (re.test(h)) return true
    if (h.includes(form)) return true
  }
  return false
}

function invertBuckets(key) {
  /** @type {Record<string, string>} */
  const map = {}
  if (!isRecord(key)) return map
  for (const [bucket, words] of Object.entries(key)) {
    if (!Array.isArray(words)) continue
    for (const word of words) {
      map[String(word)] = String(bucket)
    }
  }
  return map
}

function isSpeakerKey(key) {
  return /^speaker[_\s]?\d+/i.test(String(key).replace(/\s+/g, "_"))
}

/** Answer key like { speaker_1: [...phrases], speaker_2: [...] } */
function isExpressionListKey(answerKey) {
  if (!isRecord(answerKey)) return false
  const entries = Object.entries(answerKey)
  if (!entries.length) return false
  const allArrays = entries.every(([, v]) => Array.isArray(v))
  if (!allArrays) return false
  return entries.some(([k]) => isSpeakerKey(k) || /expression/i.test(k))
}

/** Classic vocab bucket map: past/present/large/small — not speaker lists. */
function isBucketMapKey(answerKey) {
  if (!isRecord(answerKey)) return false
  const entries = Object.entries(answerKey)
  if (!entries.length) return false
  if (!entries.every(([, v]) => Array.isArray(v))) return false
  return !isExpressionListKey(answerKey)
}

function gradeBuckets(placement, answerKey) {
  const expectedByWord = invertBuckets(answerKey)
  const words = Object.keys(expectedByWord)
  const items = words.map((word) => {
    const expected = expectedByWord[word]
    const given = placement?.[word] ?? ""
    const ok = normalize(given) === normalize(expected)
    return { id: word, label: word, given: given || "—", expected, ok }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

function gradeTfng(byNumber, answerKey) {
  const keys = Array.isArray(answerKey) ? answerKey : []
  const items = keys.map((expected, index) => {
    const num = String(index + 1)
    const given = byNumber?.[num] ?? byNumber?.[String(index)] ?? ""
    const ok = normalize(given) === normalize(expected)
    return {
      id: num,
      label: `Q${num}`,
      given: given || "—",
      expected: String(expected),
      ok,
    }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

function gradeList(values, answerKey) {
  const keys = Array.isArray(answerKey) ? answerKey : []
  const items = keys.map((expected, index) => {
    const given = Array.isArray(values) ? values[index] ?? "" : ""
    const ok = matchesKey(given, expected)
    return {
      id: String(index + 1),
      label: `#${index + 1}`,
      given: given || "—",
      expected: String(expected),
      ok,
    }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

/** Single-value speaker answers: { speaker_1: "question 1" }. */
function gradeSpeakers(payload, answerKey) {
  if (!isRecord(answerKey)) return { correct: 0, total: 0, items: [] }
  // If values are arrays, this is an expression-list key
  if (Object.values(answerKey).some(Array.isArray)) {
    return gradeExpressionLists(payload, answerKey)
  }
  const items = Object.entries(answerKey).map(([id, expected]) => {
    const given = payload?.[id] ?? ""
    const ok = matchesKey(given, expected)
    return {
      id,
      label: id.replace(/_/g, " "),
      given: given || "—",
      expected: String(expected),
      ok,
    }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

/**
 * Multi-phrase note-taking: student free-text per speaker vs list of expected expressions.
 * Labels are the expressions themselves (not "speaker_1").
 */
function gradeExpressionLists(payload, answerKey) {
  if (!isRecord(answerKey)) return { correct: 0, total: 0, items: [] }
  /** @type {Array<object>} */
  const items = []

  for (const [groupId, expectedList] of Object.entries(answerKey)) {
    if (!Array.isArray(expectedList)) continue
    const givenText = String(
      payload?.[groupId] ??
        payload?.[`${groupId}_expressions`] ??
        payload?.[`expressions_${groupId}`] ??
        "",
    )
    const speakerLabel = isSpeakerKey(groupId)
      ? groupId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : groupId.replace(/_/g, " ")

    expectedList.forEach((expected, index) => {
      const expectedStr = String(expected)
      const ok = textContainsExpected(givenText, expectedStr)
      items.push({
        id: `${groupId}_${index + 1}`,
        label: expectedStr,
        group: speakerLabel,
        given: ok ? expectedStr : givenText.trim() ? "—" : "—",
        expected: expectedStr,
        ok,
      })
    })
  }

  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

function gradeByNumberMap(byNumber, answerKey) {
  if (!isRecord(answerKey)) return { correct: 0, total: 0, items: [] }
  const items = Object.entries(answerKey).map(([id, expected]) => {
    const given = byNumber?.[id] ?? ""
    const expectedStr = Array.isArray(expected) ? expected.join("/") : String(expected)
    const ok = Array.isArray(expected)
      ? expected.some((alt) => matchesKey(given, alt)) || matchesKey(given, expectedStr)
      : matchesKey(given, expectedStr)
    return {
      id,
      label: `Q${id}`,
      given: given || "—",
      expected: expectedStr,
      ok,
    }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

function gradeChecklist(selected, answerKey) {
  const expected = Array.isArray(answerKey) ? answerKey : []
  const selectedNorm = new Set(
    (Array.isArray(selected) ? selected : []).map((value) => normalize(value)),
  )
  const items = expected.map((word, index) => {
    const text = String(word)
    // Accept slash/paren alternatives in checklist keys
    const ok =
      selectedNorm.has(normalize(text)) ||
      expandExpectedForms(text).some((form) => selectedNorm.has(form)) ||
      [...selectedNorm].some((sel) => matchesKey(sel, text))
    return {
      id: String(index + 1),
      label: text,
      given: ok ? text : "—",
      expected: text,
      ok,
    }
  })
  const correct = items.filter((i) => i.ok).length
  return { correct, total: items.length, items }
}

/**
 * @param {{ answerKey: unknown, studentAnswers: unknown }} input
 * @returns {{ correct: number, total: number, score: number | null, items: Array<object>, graded: boolean }}
 */
export function gradeLiveExerciseAnswers({ answerKey, studentAnswers }) {
  if (answerKey == null || studentAnswers == null) {
    return { correct: 0, total: 0, score: null, items: [], graded: false }
  }

  const payload = isRecord(studentAnswers) ? studentAnswers : { kind: "raw", value: studentAnswers }
  const kind = String(payload.kind ?? "")

  let result = { correct: 0, total: 0, items: [] }

  if (kind === "expressions" || isExpressionListKey(answerKey)) {
    result = gradeExpressionLists(payload, answerKey)
  } else if (kind === "buckets" || (isRecord(payload.placement) && isBucketMapKey(answerKey))) {
    result = gradeBuckets(payload.placement ?? payload, answerKey)
  } else if (kind === "tfng" && isRecord(payload.byNumber) && Array.isArray(answerKey)) {
    result = gradeTfng(payload.byNumber, answerKey)
  } else if (
    (kind === "mcq" || kind === "tfng") &&
    isRecord(payload.byNumber) &&
    isRecord(answerKey)
  ) {
    result = gradeByNumberMap(payload.byNumber, answerKey)
  } else if (kind === "checklist" && Array.isArray(answerKey)) {
    result = gradeChecklist(payload.selected, answerKey)
  } else if (kind === "list" && Array.isArray(answerKey)) {
    result = gradeList(payload.values ?? payload.items, answerKey)
  } else if (kind === "speakers" && isRecord(answerKey)) {
    result = gradeSpeakers(payload, answerKey)
  } else if (isBucketMapKey(answerKey) && (kind === "buckets" || isRecord(payload.placement))) {
    result = gradeBuckets(payload.placement ?? payload, answerKey)
  } else if (Array.isArray(answerKey) && isRecord(payload.byNumber)) {
    result = gradeTfng(payload.byNumber, answerKey)
  } else if (Array.isArray(answerKey) && Array.isArray(payload.values)) {
    result = gradeList(payload.values, answerKey)
  } else if (isRecord(payload.byNumber) && isRecord(answerKey) && !isBucketMapKey(answerKey)) {
    result = gradeByNumberMap(payload.byNumber, answerKey)
  } else if (isRecord(answerKey) && !Array.isArray(answerKey) && Object.values(answerKey).every((v) => typeof v === "string" || typeof v === "number")) {
    // Flat map of string answers (e.g. synonym replacements) with byNumber or direct keys
    if (isRecord(payload.byNumber)) {
      result = gradeByNumberMap(payload.byNumber, answerKey)
    } else {
      result = gradeByNumberMap(payload, answerKey)
    }
  } else {
    return { correct: 0, total: 0, score: null, items: [], graded: false }
  }

  if (result.total <= 0) {
    return { correct: 0, total: 0, score: null, items: [], graded: false }
  }

  const score = Math.round((100 * result.correct) / result.total)
  return { ...result, score, graded: true }
}

export function getUnitAnswerKey(bookDoc, unitNumber, exerciseId) {
  const keyRoot = bookDoc?.answer_key ?? {}
  const unitKey = keyRoot[`unit_${unitNumber}`] ?? keyRoot[`unit${unitNumber}`] ?? {}
  if (!isRecord(unitKey)) return null
  return unitKey[String(exerciseId)] ?? null
}

export {
  matchesKey,
  expandSlashAlternatives,
  textContainsExpected,
  isExpressionListKey,
  isBucketMapKey,
}
