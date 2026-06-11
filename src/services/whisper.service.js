import { env } from "../config/env.js"

const AUDIO_URL_RE = /^https?:\/\//i

/** @returns {boolean} */
export function isSpeakingAudioUrl(value) {
  return typeof value === "string" && AUDIO_URL_RE.test(value)
}

/**
 * @param {string} url
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
 */
export async function whisperHealth() {
  if (!env.whisper.enabled) {
    return { ok: false, error: "Whisper service URL is not configured" }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${env.whisper.url}/health`, { signal: controller.signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: data.detail ?? `HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "Request timed out" : err.message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download audio from a public URL and send it to the Whisper service.
 * @param {string} audioUrl
 * @returns {Promise<string>}
 */
export async function transcribeAudioUrl(audioUrl) {
  if (!env.whisper.enabled) {
    throw new Error("Whisper service is not configured")
  }

  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) {
    throw new Error(`Failed to download audio (${audioRes.status})`)
  }

  const buffer = Buffer.from(await audioRes.arrayBuffer())
  const contentType = audioRes.headers.get("content-type") ?? "audio/m4a"
  const ext = contentType.includes("webm")
    ? "webm"
    : contentType.includes("wav")
      ? "wav"
      : "m4a"

  const form = new FormData()
  form.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`)
  form.append("language", env.whisper.language)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.whisper.timeoutMs)

  try {
    const res = await fetch(`${env.whisper.url}/transcribe`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.detail ?? `Transcription failed (HTTP ${res.status})`)
    }
    return (data.text ?? "").trim()
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Transcription timed out")
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {object[]} mistakes
 * @returns {Promise<object[]>}
 */
export async function transcribeMistakes(mistakes = []) {
  const updated = []
  for (const mistake of mistakes) {
    if (!isSpeakingAudioUrl(mistake?.userAnswer)) {
      updated.push(mistake)
      continue
    }
    if (mistake.transcription) {
      updated.push(mistake)
      continue
    }
    try {
      const text = await transcribeAudioUrl(mistake.userAnswer)
      updated.push({ ...mistake, transcription: text || undefined })
    } catch (err) {
      console.warn("[whisper] transcription failed:", mistake.userAnswer, err.message)
      updated.push(mistake)
    }
  }
  return updated
}
