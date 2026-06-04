/**
 * Telegram bot for the IELTS / Learnix platform.
 *
 * Flow:
 *   1. On /start the bot asks the user for their Student ID.
 *   2. The user sends the ID. If it matches a real student, the bot stores the
 *      Telegram chat id on that student record (`telegramId`) and confirms.
 *      If the ID is wrong, the bot asks again (with light brute-force throttling).
 *   3. From then on the bot pushes notifications about newly assigned homework
 *      and graded results, and answers /tasks, /results, /me and /unlink.
 *
 * It reuses the same MongoDB + Mongoose models as the API. No extra npm
 * dependency: it talks to the Telegram Bot API over HTTPS via the global fetch.
 *
 * Run with:  npm run bot   (set TELEGRAM_BOT_TOKEN in .env first)
 */
import "../config/mongoose.js"
import { env } from "../config/env.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { Student } from "../models/Student.js"
import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Notification } from "../models/Notification.js"

const TOKEN = env.telegram.botToken
const API = `https://api.telegram.org/bot${TOKEN}`

// Accept ids in the platform's `std_<time>_<rand>` shape. Validating the format
// before hitting the DB avoids needless queries and rejects junk input.
const STUDENT_ID_RE = /^std_[a-z0-9]+_[a-z0-9]{3,8}$/i

// Per-chat throttle for failed link attempts (anti-enumeration of student ids).
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 60_000
const attempts = new Map() // chatId -> { count, windowStart }

// ─── Telegram API helpers ────────────────────────────────────────────────────
async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`)
  return data.result
}

function send(chatId, text) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }).catch(
    (err) => console.error("[bot] sendMessage error:", err.message),
  )
}

/** Escape the few characters Telegram's HTML parse mode cares about. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function fmtDate(date) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

const SUBJECT_EMOJI = {
  reading: "📖",
  listening: "🎧",
  writing: "✍️",
  speaking: "🗣️",
  grammar: "🔤",
  vocabulary: "📝",
}

const STATUS_LABEL = {
  pending: "🕓 Not started",
  in_progress: "⏳ In progress",
  submitted: "📨 Submitted",
  graded: "✅ Graded",
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
function tooManyAttempts(chatId) {
  const now = Date.now()
  const rec = attempts.get(chatId)
  if (!rec || now - rec.windowStart > ATTEMPT_WINDOW_MS) {
    attempts.set(chatId, { count: 1, windowStart: now })
    return false
  }
  rec.count += 1
  return rec.count > MAX_ATTEMPTS
}

function resetAttempts(chatId) {
  attempts.delete(chatId)
}

// ─── Message builders ────────────────────────────────────────────────────────
async function buildTasksMessage(studentId) {
  const subs = await Submission.find({ studentId }).lean()
  if (subs.length === 0) return "🎉 You have no assigned tasks right now."

  const hwById = new Map(
    (await Homework.find({ _id: { $in: subs.map((s) => s.homeworkId) } }).lean()).map((h) => [
      h._id,
      h,
    ]),
  )
  const active = subs
    .filter((s) => s.status === "pending" || s.status === "in_progress")
    .map((s) => ({ sub: s, hw: hwById.get(s.homeworkId) }))
    .filter((x) => x.hw)
    .sort((a, b) => new Date(a.hw.dueAt) - new Date(b.hw.dueAt))

  if (active.length === 0) return "🎉 No pending tasks — you're all caught up!"

  const lines = active.map(({ sub, hw }) => {
    const emoji = SUBJECT_EMOJI[hw.subject] ?? "📚"
    return `${emoji} <b>${esc(hw.title)}</b>\n   Due ${fmtDate(hw.dueAt)} · ${STATUS_LABEL[sub.status]}`
  })
  return `📋 <b>Your tasks (${active.length})</b>\n\n${lines.join("\n\n")}`
}

async function buildResultsMessage(studentId) {
  const subs = await Submission.find({
    studentId,
    status: { $in: ["submitted", "graded"] },
  })
    .sort({ submittedAt: -1 })
    .limit(10)
    .lean()
  if (subs.length === 0) return "📊 No results yet. Finish a task to see your scores here."

  const hwById = new Map(
    (await Homework.find({ _id: { $in: subs.map((s) => s.homeworkId) } }).lean()).map((h) => [
      h._id,
      h,
    ]),
  )
  const lines = subs.map((s) => {
    const hw = hwById.get(s.homeworkId)
    const title = hw ? esc(hw.title) : "Homework"
    const score = typeof s.score === "number" ? `Band ${s.score.toFixed(1)}` : "—"
    const acc =
      s.attempt && s.attempt.totalQuestions
        ? ` · ${s.attempt.correctCount}/${s.attempt.totalQuestions} correct`
        : ""
    return `• <b>${title}</b>\n   ${STATUS_LABEL[s.status]} · ${score}${acc}`
  })
  return `📊 <b>Recent results</b>\n\n${lines.join("\n\n")}`
}

async function buildSummary(student) {
  const [tasks, results] = await Promise.all([
    buildTasksMessage(student._id),
    buildResultsMessage(student._id),
  ])
  return `${tasks}\n\n${results}`
}

const HELP =
  "Commands:\n" +
  "/tasks — your assigned homework\n" +
  "/results — your recent scores\n" +
  "/me — your linked account\n" +
  "/unlink — disconnect this chat\n" +
  "/help — show this message"

// ─── Update handling ──────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id)
  const text = (msg.text ?? "").trim()
  if (!text) return

  const linked = await Student.findOne({ telegramId: chatId })

  // Commands
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "")
    if (cmd === "/start") {
      if (linked) {
        await send(chatId, `👋 Welcome back, <b>${esc(linked.name)}</b>!\n\n${HELP}`)
      } else {
        await send(
          chatId,
          "👋 Welcome to <b>Learnix</b>!\n\nTo receive your homework and results, please send me your <b>Student ID</b> (ask your tutor if you don't know it).",
        )
      }
      return
    }
    if (!linked) {
      await send(chatId, "🔒 Please link your account first — send me your <b>Student ID</b>.")
      return
    }
    if (cmd === "/help") return void send(chatId, HELP)
    if (cmd === "/tasks") return void send(chatId, await buildTasksMessage(linked._id))
    if (cmd === "/results") return void send(chatId, await buildResultsMessage(linked._id))
    if (cmd === "/me") {
      return void send(
        chatId,
        `👤 <b>${esc(linked.name)}</b>\nLinked since ${fmtDate(linked.telegramLinkedAt)}`,
      )
    }
    if (cmd === "/unlink") {
      linked.telegramId = undefined
      linked.telegramLinkedAt = undefined
      linked.telegramLastNotifiedAt = undefined
      await linked.save()
      return void send(
        chatId,
        "🔌 This chat is now disconnected. Send your Student ID anytime to reconnect.",
      )
    }
    return void send(chatId, `Unknown command.\n\n${HELP}`)
  }

  // Already linked: nudge towards commands instead of treating text as an id.
  if (linked) {
    await send(chatId, `You're already linked, <b>${esc(linked.name)}</b>.\n\n${HELP}`)
    return
  }

  // ─── Linking: the text should be a Student ID ─────────────────────────────
  if (tooManyAttempts(chatId)) {
    await send(chatId, "⛔ Too many attempts. Please wait a minute and try again.")
    return
  }
  if (!STUDENT_ID_RE.test(text)) {
    await send(
      chatId,
      "❌ That doesn't look like a valid Student ID. It looks like <code>std_xxxxx_xxxxx</code>. Please try again.",
    )
    return
  }

  const student = await Student.findById(text)
  if (!student) {
    await send(chatId, "❌ No student found with that ID. Please check it and send it again.")
    return
  }

  // Move the link to this chat (a student can only be linked to one chat).
  await Student.updateMany({ telegramId: chatId }, { $unset: { telegramId: "", telegramLinkedAt: "" } })
  student.telegramId = chatId
  student.telegramLinkedAt = new Date()
  // Start the notification watermark "now" so we don't replay old history;
  // we send a fresh summary instead.
  student.telegramLastNotifiedAt = new Date()
  await student.save()
  resetAttempts(chatId)

  await send(
    chatId,
    `✅ Linked! Hi <b>${esc(student.name)}</b>, you'll now get your homework and results here.\n\n${HELP}`,
  )
  await send(chatId, await buildSummary(student))
}

// ─── Notification poller ──────────────────────────────────────────────────────
async function pushPendingNotifications() {
  const linked = await Student.find({ telegramId: { $exists: true, $ne: null } }).lean()
  for (const student of linked) {
    const since = student.telegramLastNotifiedAt ?? student.telegramLinkedAt ?? new Date(0)
    const notes = await Notification.find({ studentId: student._id, createdAt: { $gt: since } })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean()
    if (notes.length === 0) continue

    for (const n of notes) {
      const icon = n.type === "result" ? "📊" : n.type === "homework" ? "📋" : "🔔"
      await send(student.telegramId, `${icon} <b>${esc(n.title)}</b>\n${esc(n.message)}`)
    }
    const newest = notes[notes.length - 1].createdAt
    await Student.updateOne({ _id: student._id }, { telegramLastNotifiedAt: newest })
  }
}

// ─── Long-polling loop ────────────────────────────────────────────────────────
let running = true
let offset = 0

async function pollUpdates() {
  while (running) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 30, allowed_updates: ["message"] })
      for (const update of updates) {
        offset = update.update_id + 1
        if (update.message) {
          await handleMessage(update.message).catch((err) =>
            console.error("[bot] handler error:", err.message),
          )
        }
      }
    } catch (err) {
      console.error("[bot] getUpdates error:", err.message)
      await new Promise((r) => setTimeout(r, 3_000))
    }
  }
}

async function main() {
  if (!TOKEN) {
    console.error("[bot] TELEGRAM_BOT_TOKEN is not set. Add it to backend/.env")
    process.exit(1)
  }
  await connectDB()
  const me = await tg("getMe", {})
  console.log(`[bot] started as @${me.username}`)

  const notifTimer = setInterval(() => {
    pushPendingNotifications().catch((err) => console.error("[bot] poller error:", err.message))
  }, env.telegram.pollIntervalMs)

  const shutdown = async () => {
    running = false
    clearInterval(notifTimer)
    await disconnectDB().catch(() => {})
    console.log("[bot] stopped")
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)

  await pollUpdates()
}

main().catch((err) => {
  console.error("[bot] fatal:", err.message)
  process.exit(1)
})
