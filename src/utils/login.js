import crypto from "crypto"
import { User } from "../models/User.js"

const CYRILLIC = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
}

/** Transliterate Cyrillic/Latin name to a URL-safe login slug base. */
export function slugifyName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/** Build three login variants from a full name. */
export function loginVariantsFromName(name) {
  const parts = slugifyName(name)
  if (parts.length === 0) return []

  const first = parts[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : ""
  const variants = []

  if (first && last) variants.push(`${first}.${last}`, `${first}${last}`, `${first}_${last}`)
  else if (first) variants.push(first, `${first}1`, `${first}_1`)

  return [...new Set(variants.map((v) => v.slice(0, 32)).filter(Boolean))].slice(0, 3)
}

async function isLoginTaken(login, orgId = null) {
  const normalized = login.toLowerCase()
  const filter = { $or: [{ login: normalized }, { email: normalized }] }
  if (orgId) filter.orgId = orgId
  const existing = await User.findOne(filter).select("_id")
  return Boolean(existing)
}

/** Return up to 3 unique, available login suggestions for a name. */
export async function suggestLogins(name, orgId = null) {
  const bases = loginVariantsFromName(name)
  const suggestions = []

  for (const base of bases) {
    if (suggestions.length >= 3) break
    if (!(await isLoginTaken(base, orgId))) suggestions.push(base)
  }

  // If base variants are taken, try numbered suffixes on the first base.
  const fallback = bases[0]
  if (fallback && suggestions.length < 3) {
    for (let i = 1; suggestions.length < 3 && i <= 99; i++) {
      const candidate = `${fallback}${i}`.slice(0, 32)
      if (!suggestions.includes(candidate) && !(await isLoginTaken(candidate, orgId))) {
        suggestions.push(candidate)
      }
    }
  }

  return suggestions.slice(0, 3)
}

const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** Generate a readable random password (no ambiguous chars). */
export function generatePassword(length = 10) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("")
}

/** Normalize login input for storage and lookup. */
export function normalizeLogin(value) {
  return String(value ?? "").trim().toLowerCase()
}
