#!/usr/bin/env node
/**
 * PM2 production: foreground start/stop без дублирования процессов.
 *
 *   npm run prod       — pm2 delete ecosystem → start --no-daemon (терминал занят)
 *   npm run prod:stop  — pm2 delete all → pm2 kill
 */
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const ecosystem = "ecosystem.config.cjs"

function pm2(args, { ignoreError = false } = {}) {
  const result = spawnSync("pm2", args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  })
  if (!ignoreError && result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  return result
}

const command = process.argv[2]

if (command === "stop") {
  pm2(["delete", "all"], { ignoreError: true })
  pm2(["kill"], { ignoreError: true })
  process.exit(0)
}

if (command === "start") {
  // Убираем старые ielts-backend / ielts-bot, чтобы не плодить дубликаты.
  pm2(["delete", ecosystem], { ignoreError: true })
  pm2(["start", ecosystem, "--env", "production", "--no-daemon"])
  process.exit(0)
}

console.error("Usage: node scripts/pm2-prod.mjs <start|stop>")
process.exit(1)
