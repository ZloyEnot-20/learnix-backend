/** Escape user input before using it inside a MongoDB $regex. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
