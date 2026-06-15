/**
 * Detect outbound public IPs (VPS may use IPv6 while Atlas whitelist has only IPv4).
 */
export async function detectOutboundIps() {
  const timeout = { signal: AbortSignal.timeout(8000) }
  const [ipv4, ipv6] = await Promise.all([
    fetch("https://ipv4.icanhazip.com", timeout)
      .then((r) => r.text())
      .then((t) => t.trim())
      .catch(() => null),
    fetch("https://ipv6.icanhazip.com", timeout)
      .then((r) => r.text())
      .then((t) => t.trim())
      .catch(() => null),
  ])
  return { ipv4, ipv6 }
}

export function formatAtlasWhitelistHint(ips) {
  const lines = []
  if (ips.ipv4) lines.push(`IPv4: ${ips.ipv4}/32`)
  if (ips.ipv6) lines.push(`IPv6: ${ips.ipv6}/128`)
  if (!lines.length) lines.push("run: curl -4 ifconfig.me  and  curl -6 ifconfig.me")
  return lines.join("\n")
}
