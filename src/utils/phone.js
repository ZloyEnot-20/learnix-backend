/** Strip everything except digits for consistent phone matching. */
export function normalizePhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "")
  if (digits.startsWith("998")) return digits.slice(0, 12)
  if (digits.length === 9) return `998${digits}`
  return digits
}

const UZ_MOBILE_OPERATORS = new Set(["90", "91", "93", "94", "95", "97", "98", "99", "33", "88", "77"])

export function isValidUzPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized.startsWith("998") || normalized.length !== 12) return false
  return UZ_MOBILE_OPERATORS.has(normalized.slice(3, 5))
}

export function isValidPhone(phone) {
  return isValidUzPhone(phone)
}
