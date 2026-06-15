import { detectOutboundIps, formatAtlasWhitelistHint } from "./outboundIp.js"

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
  console.error("[db] Atlas → Network Access: whitelist ALL outbound IPs below (VPS may use IPv6, not IPv4)")
  const ips = await detectOutboundIps()
  console.error("[db] add to Atlas:\n" + formatAtlasWhitelistHint(ips))
  if (ips.ipv6 && !ips.ipv4) {
    console.error("[db] this server exits via IPv6 only — 0.0.0.0/0 alone is NOT enough; add ::/0 or the IPv6 address")
  }
}
