/**
 * Upsert reading tests on a remote API (production) via POST /exercises/reading/import.
 *
 * Usage:
 *   PUSH_API_URL=https://api.learnix.space/api \
 *   PUSH_ADMIN_LOGIN=your@email.com \
 *   PUSH_ADMIN_PASSWORD=secret \
 *   node src/scripts/push-reading-import.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { normalizeReadingInput } from "../services/ieltsReading.service.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const READING_DIR = path.resolve(__dirname, "../../../exercises/ielts/reading")

const apiBase = (process.env.PUSH_API_URL ?? "https://api.learnix.space/api").replace(/\/$/, "")
const login = process.env.PUSH_ADMIN_LOGIN
const password = process.env.PUSH_ADMIN_PASSWORD

if (!login || !password) {
  console.error("Set PUSH_ADMIN_LOGIN and PUSH_ADMIN_PASSWORD")
  process.exit(1)
}

function loadReadings() {
  const indexPath = path.join(READING_DIR, "index.json")
  const { items } = JSON.parse(fs.readFileSync(indexPath, "utf8"))
  const readings = []
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    const filePath = path.join(READING_DIR, item.file)
    if (!fs.existsSync(filePath)) continue
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
    readings.push(
      normalizeReadingInput(
        {
          slug: item.id,
          title: item.title,
          totalTimeMinutes: item.estimatedMinutes ?? data.totalTimeMinutes,
          questionCount: item.questionCount,
          subtitle: item.subtitle,
          data,
          order: idx,
        },
        idx,
      ),
    )
  }
  return readings
}

const loginRes = await fetch(`${apiBase}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login, password }),
})
if (!loginRes.ok) {
  console.error("Login failed:", loginRes.status, await loginRes.text())
  process.exit(1)
}
const { accessToken } = await loginRes.json()

const readings = loadReadings()
const importRes = await fetch(`${apiBase}/exercises/reading/import`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ readings }),
})
const body = await importRes.text()
if (!importRes.ok) {
  console.error("Import failed:", importRes.status, body)
  process.exit(1)
}
console.log(body)
