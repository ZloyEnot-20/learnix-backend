let atlasHintLogged = false

function isAtlasNetworkError(message) {
  return /whitelist|Could not connect to any servers/i.test(String(message ?? ""))
}

/** Log Atlas IP whitelist hint once (typical VPS vs local Compass mismatch). */
export async function logDbConnectionFailure(label, err) {
  console.error(`[db] ${label} failed:`, err?.message)
  if (!isAtlasNetworkError(err?.message)) {
    console.error("[db] is MongoDB running? Check MONGODB_URI in .env")
    return
  }
  if (atlasHintLogged) return
  atlasHintLogged = true
  console.error(
    "[db] Atlas → Network Access: add this server's public IP (VPS IP ≠ your home PC where Compass works)",
  )
  try {
    const res = await fetch("https://ifconfig.me/ip", { signal: AbortSignal.timeout(5000) })
    const ip = (await res.text()).trim()
    if (ip) console.error(`[db] outbound IPv4 to whitelist: ${ip}`)
  } catch {
    console.error("[db] on the server run: curl -4 ifconfig.me")
  }
}
