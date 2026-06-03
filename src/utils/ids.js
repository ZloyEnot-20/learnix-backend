import { randomBytes } from "node:crypto"

/**
 * Stable, URL-safe id generator mirroring the frontend `uid()` scheme:
 * `<prefix>_<base36 time>_<random>`.
 */
export function uid(prefix = "id") {
  const time = Date.now().toString(36)
  const rand = randomBytes(4).toString("hex").slice(0, 5)
  return `${prefix}_${time}_${rand}`
}
