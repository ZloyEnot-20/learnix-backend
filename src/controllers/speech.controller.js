import { env } from "../config/env.js"
import { whisperHealth, transcribeAudioUrl } from "../services/whisper.service.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { assertPublicHttpUrl } from "../utils/ssrf.js"

/** GET /speech/status — staff-only service health for the admin panel. */
export const getSpeechStatus = asyncHandler(async (_req, res) => {
  const health = await whisperHealth()

  res.json({
    configured: env.whisper.enabled,
    serviceUrl: env.whisper.url,
    model: env.whisper.model,
    language: env.whisper.language,
    online: health.ok,
    loaded: health.ok ? Boolean(health.data?.loaded) : false,
    status: health.ok ? (health.data?.status ?? "unknown") : "offline",
    error: health.ok ? (health.data?.error ?? null) : health.error,
  })
})

/** POST /speech/test — transcribe a public audio URL to verify the pipeline. */
export const testSpeechTranscription = asyncHandler(async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== "string") {
    throw ApiError.badRequest("url is required")
  }
  assertPublicHttpUrl(url)

  const text = await transcribeAudioUrl(url)
  res.json({ text, language: env.whisper.language })
})
