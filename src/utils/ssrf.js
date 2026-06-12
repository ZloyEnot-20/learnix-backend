import { URL } from "url"
import { ApiError } from "./ApiError.js"

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "kubernetes.default.svc",
])

function parseIpv4(hostname) {
  const parts = hostname.split(".")
  if (parts.length !== 4) return null
  const octets = parts.map((p) => Number(p))
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return octets
}

function isPrivateIpv4(octets) {
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

function isPrivateIpv6(hostname) {
  const h = hostname.toLowerCase()
  if (h === "::1" || h === "::") return true
  if (h.startsWith("fc") || h.startsWith("fd")) return true // unique local
  if (h.startsWith("fe80:")) return true // link-local
  return false
}

/** Reject URLs that could reach internal services (SSRF). */
export function assertPublicHttpUrl(urlString) {
  let url
  try {
    url = new URL(urlString)
  } catch {
    throw ApiError.badRequest("Invalid URL")
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw ApiError.badRequest("Only http(s) URLs are allowed")
  }
  if (url.username || url.password) {
    throw ApiError.badRequest("URLs with credentials are not allowed")
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw ApiError.badRequest("URL host is not allowed")
  }

  const ipv4 = parseIpv4(host)
  if (ipv4 && isPrivateIpv4(ipv4)) {
    throw ApiError.badRequest("Private network URLs are not allowed")
  }
  if (host.includes(":") && isPrivateIpv6(host)) {
    throw ApiError.badRequest("Private network URLs are not allowed")
  }

  return url
}
