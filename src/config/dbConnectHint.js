import { detectOutboundIps, formatAtlasWhitelistHint } from "./outboundIp.js"

let atlasHintLogged = false

/** Extra Atlas network hints after logMongoConnectError (network kind only). */
export async function logMongoNetworkHint() {
  if (atlasHintLogged) return
  atlasHintLogged = true
  console.error("[db] → Network/IP: whitelist outbound IP(s) in Atlas → Network Access")
  console.error("[db] → VPS may use IPv6; family:4 forces IPv4 — whitelist IPv4 or add ::/0")
  const ips = await detectOutboundIps()
  console.error("[db] add to Atlas:\n" + formatAtlasWhitelistHint(ips))
  if (ips.ipv6 && !ips.ipv4) {
    console.error("[db] this server exits via IPv6 only — 0.0.0.0/0 alone is not enough")
  }
}

/** @deprecated use logMongoConnectError + logMongoNetworkHint */
export async function logDbConnectionFailure(label, err) {
  const { logMongoConnectError } = await import("./mongoOptions.js")
  await logMongoConnectError(label, err, logMongoNetworkHint)
}
