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
    .replace(/\s+/g, " ")
}

/** Accept slash alternatives and optional parenthetical parts. */
function matchesKey(given, expected) {
  const g = normalize(given)
  if (!g) return false
  const alts = String(expected ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
  for (const alt of alts) {
    const optional = []
    const required = alt.replace(/\(([^)]+)\)/g, (_, inner) => {
      optional.push(normalize(inner))
      return ""
    })
    const core = normalize(required)
    if (core && g === core) return true
    if (core && optional.length) {
      for (const opt of optional) {
        if (g === normalize(`${opt} ${core}`) || g === normalize(`${core} ${opt}`)) return true
      }
    }
    if (!core && optional.some((opt) => g === opt)) return true
    if (g === normalize(alt)) return true
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

function gradeSpeakers(payload, answerKey) {
  if (!isRecord(answerKey)) return { correct: 0, total: 0, items: [] }
  const items = Object.entries(answerKey).map(([id, expected]) => {
    const given = payload?.[id] ?? ""
    const ok = normalize(given) === normalize(expected)
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

function gradeByNumberMap(byNumber, answerKey) {
  if (!isRecord(answerKey)) return { correct: 0, total: 0, items: [] }
  const items = Object.entries(answerKey).map(([id, expected]) => {
    const given = byNumber?.[id] ?? ""
    const ok = matchesKey(given, expected)
    return {
      id,
      label: `Q${id}`,
      given: given || "—",
      expected: String(expected),
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
    const ok = selectedNorm.has(normalize(text))
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

  if (kind === "buckets" || (isRecord(payload.placement) && isRecord(answerKey))) {
    result = gradeBuckets(payload.placement ?? payload, answerKey)
  } else if (kind === "tfng" || (isRecord(payload.byNumber) && Array.isArray(answerKey))) {
    result = gradeTfng(payload.byNumber ?? payload, answerKey)
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
  } else if (isRecord(answerKey) && !Array.isArray(answerKey) && Object.values(answerKey).every(Array.isArray)) {
    // Fallback: bucket map with placement at root
    result = gradeBuckets(payload.placement ?? payload, answerKey)
  } else if (Array.isArray(answerKey) && isRecord(payload.byNumber)) {
    result = gradeTfng(payload.byNumber, answerKey)
  } else if (isRecord(payload.byNumber) && isRecord(answerKey)) {
    result = gradeByNumberMap(payload.byNumber, answerKey)
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
