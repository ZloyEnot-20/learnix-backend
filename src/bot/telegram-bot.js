/**
 * Learnix Telegram bot — ota-onalar uchun (parent notifications).
 *
 * G'oya: bot ota-onalarga farzandining BARCHA o'quv faoliyati haqida o'zbek
 * tilida xabar beradi (yangi vazifalar, yakunlangan ishlar, baholar, eslatmalar).
 *
 * Oqim:
 *   1. /start — bot farzandning "O'quvchi ID" sini so'raydi.
 *   2. ID to'g'ri bo'lsa — chat shu o'quvchiga "ulanadi" (ParentLink saqlanadi).
 *      Bitta chat bir nechta farzandni kuzatishi mumkin. ID noto'g'ri bo'lsa —
 *      qayta so'raydi (urinishlar cheklangan).
 *   3. Keyin bot yangi bildirishnomalarni avtomatik yuboradi va
 *      /vazifalar, /natijalar, /farzandlarim, /uzish buyruqlariga javob beradi.
 *
 * API bilan bir xil MongoDB/Mongoose modellaridan foydalanadi. Qo'shimcha npm
 * paketi yo'q — Telegram Bot API bilan global fetch orqali ishlaydi.
 *
 * Ishga tushirish:  npm run bot   (avval .env da TELEGRAM_BOT_TOKEN to'ldiring)
 */
import "../config/mongoose.js"
import { env } from "../config/env.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { Student } from "../models/Student.js"
import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { Notification } from "../models/Notification.js"
import { ParentLink } from "../models/ParentLink.js"

const TOKEN = env.telegram.botToken
const API = `https://api.telegram.org/bot${TOKEN}`

// Platformaning `std_<time>_<rand>` ko'rinishidagi id. DB ga murojaatdan oldin
// formatni tekshirish keraksiz so'rovlardan va axlat kiritishdan himoya qiladi.
const STUDENT_ID_RE = /^std_[a-z0-9]+_[a-z0-9]{3,8}$/i

// Muvaffaqiyatsiz ulanish urinishlari uchun cheklov (id larni terib topishga qarshi).
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 60_000
const attempts = new Map() // chatId -> { count, windowStart }

// ─── Telegram API yordamchilari ──────────────────────────────────────────────
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
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }).catch((err) => console.error("[bot] sendMessage error:", err.message))
}

/** Telegram HTML parse rejimidagi maxsus belgilarni qochirish. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function fmtDate(date) {
  if (!date) return "—"
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

const SUBJECT_EMOJI = {
  reading: "📖",
  listening: "🎧",
  writing: "✍️",
  speaking: "🗣️",
  grammar: "🔤",
  vocabulary: "📝",
}

const STATUS_UZ = {
  pending: "🕓 Boshlanmagan",
  in_progress: "⏳ Bajarilyapti",
  submitted: "📨 Topshirilgan",
  graded: "✅ Baholangan",
}

const HELP =
  "ℹ️ <b>Buyruqlar</b>\n" +
  "/vazifalar — farzandning joriy vazifalari\n" +
  "/natijalar — oxirgi natijalar\n" +
  "/farzandlarim — kuzatilayotgan farzandlar\n" +
  "/uzish — kuzatuvni to'xtatish\n" +
  "/yordam — ushbu yordam"

// ─── Cheklov (rate limiting) ──────────────────────────────────────────────────
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

// ─── Ma'lumotlar ──────────────────────────────────────────────────────────────
/** Ushbu chat kuzatayotgan barcha farzandlar (link + student). */
async function getChildren(chatId) {
  const links = await ParentLink.find({ chatId }).lean()
  if (links.length === 0) return []
  const students = await Student.find({ _id: { $in: links.map((l) => l.studentId) } }).lean()
  const byId = new Map(students.map((s) => [s._id, s]))
  return links
    .map((link) => ({ link, student: byId.get(link.studentId) }))
    .filter((x) => x.student)
}

async function buildTasksMessage(studentId, childName) {
  const subs = await Submission.find({ studentId }).lean()
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

  if (active.length === 0) {
    return `🎉 <b>${esc(childName)}</b>: hozircha faol vazifalar yo'q.`
  }
  const lines = active.map(({ sub, hw }) => {
    const emoji = SUBJECT_EMOJI[hw.subject] ?? "📚"
    return `${emoji} <b>${esc(hw.title)}</b>\n   Muddat: ${fmtDate(hw.dueAt)} · ${STATUS_UZ[sub.status]}`
  })
  return `📋 <b>${esc(childName)} — vazifalar (${active.length})</b>\n\n${lines.join("\n\n")}`
}

async function buildResultsMessage(studentId, childName) {
  const subs = await Submission.find({
    studentId,
    status: { $in: ["submitted", "graded"] },
  })
    .sort({ submittedAt: -1 })
    .limit(10)
    .lean()
  if (subs.length === 0) {
    return `📊 <b>${esc(childName)}</b>: hali natijalar yo'q.`
  }
  const hwById = new Map(
    (await Homework.find({ _id: { $in: subs.map((s) => s.homeworkId) } }).lean()).map((h) => [
      h._id,
      h,
    ]),
  )
  const lines = subs.map((s) => {
    const hw = hwById.get(s.homeworkId)
    const title = hw ? esc(hw.title) : "Vazifa"
    const score = typeof s.score === "number" ? `${s.score.toFixed(1)} ball` : "—"
    const acc =
      s.attempt && s.attempt.totalQuestions
        ? ` · ${s.attempt.correctCount}/${s.attempt.totalQuestions} to'g'ri`
        : ""
    return `• <b>${title}</b>\n   ${STATUS_UZ[s.status]} · ${score}${acc}`
  })
  return `📊 <b>${esc(childName)} — oxirgi natijalar</b>\n\n${lines.join("\n\n")}`
}

async function buildSummary(child) {
  const [tasks, results] = await Promise.all([
    buildTasksMessage(child.student._id, child.student.name),
    buildResultsMessage(child.student._id, child.student.name),
  ])
  return `${tasks}\n\n${results}`
}

/** Bitta bildirishnomadan ota-ona uchun o'zbekcha matn tuzish. */
function parentNotificationText(childName, note) {
  // Title odatda "New homework: <nom>" ko'rinishida — nomni ajratib olamiz.
  const subject = note.title?.includes(":")
    ? note.title.split(":").slice(1).join(":").trim()
    : note.title ?? ""
  const who = `👤 <b>${esc(childName)}</b>`

  switch (note.type) {
    case "homework":
      return `📋 <b>Yangi vazifa</b>\n${who}\n📚 ${esc(subject)}\nFarzandingizga yangi vazifa berildi.`
    case "result": {
      const isCompleted = /complete/i.test(note.title ?? "")
      const m = (note.message ?? "").match(/(\d(?:\.\d)?)/)
      const ball = m ? `\n📈 Ball: <b>${m[1]}</b>` : ""
      const head = isCompleted ? "✅ Vazifa yakunlandi" : "📊 Vazifa baholandi"
      return `${head}\n${who}\n📚 ${esc(subject)}${ball}`
    }
    case "reminder":
      return `⏰ <b>Eslatma</b>\n${who}\n${esc(subject)}`
    case "achievement":
      return `🏆 <b>Yutuq</b>\n${who}\n${esc(subject)}`
    case "entry_test":
      return `📝 <b>Kirish testi</b>\n${who}\n${esc(subject)}`
    default:
      return `🔔 <b>Xabar</b>\n${who}\n${esc(subject)}`
  }
}

// ─── Xabarlarni qayta ishlash ────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id)
  const text = (msg.text ?? "").trim()
  if (!text) return

  const parentName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || undefined

  // Buyruqlar
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "")
    const children = await getChildren(chatId)

    if (cmd === "/start") {
      if (children.length > 0) {
        const names = children.map((c) => `• <b>${esc(c.student.name)}</b>`).join("\n")
        await send(
          chatId,
          `👋 Xush kelibsiz!\n\nSiz kuzatayotgan farzandlar:\n${names}\n\n${HELP}\n\nYana bitta farzandni qo'shish uchun uning O'quvchi ID sini yuboring.`,
        )
      } else {
        await send(
          chatId,
          "👋 Assalomu alaykum! Bu <b>Learnix</b> o'quv markazining ota-onalar uchun boti.\n\n" +
            "Farzandingizning o'qishini kuzatish uchun uning <b>O'quvchi ID</b> raqamini yuboring " +
            "(ID ni o'qituvchi yoki markaz ma'muriyatidan oling).",
        )
      }
      return
    }

    if (cmd === "/yordam") return void send(chatId, HELP)

    if (children.length === 0) {
      await send(
        chatId,
        "🔒 Avval farzandingizni ulang — uning <b>O'quvchi ID</b> raqamini yuboring.",
      )
      return
    }

    if (cmd === "/vazifalar") {
      for (const c of children) await send(chatId, await buildTasksMessage(c.student._id, c.student.name))
      return
    }
    if (cmd === "/natijalar") {
      for (const c of children) await send(chatId, await buildResultsMessage(c.student._id, c.student.name))
      return
    }
    if (cmd === "/farzandlarim") {
      const names = children
        .map((c) => `• <b>${esc(c.student.name)}</b> — ${fmtDate(c.link.createdAt)} dan beri`)
        .join("\n")
      return void send(chatId, `👨‍👩‍👧 <b>Kuzatilayotgan farzandlar</b>\n${names}`)
    }
    if (cmd === "/uzish") {
      await ParentLink.deleteMany({ chatId })
      return void send(
        chatId,
        "🔌 Kuzatuv to'xtatildi. Istalgan vaqtda O'quvchi ID yuborib qayta ulashingiz mumkin.",
      )
    }
    return void send(chatId, `❓ Noma'lum buyruq.\n\n${HELP}`)
  }

  // ─── Ulanish: matn O'quvchi ID bo'lishi kerak ─────────────────────────────
  if (tooManyAttempts(chatId)) {
    await send(chatId, "⛔ Juda ko'p urinish. Iltimos, bir daqiqadan so'ng qayta urinib ko'ring.")
    return
  }
  if (!STUDENT_ID_RE.test(text)) {
    await send(
      chatId,
      "❌ Bu O'quvchi ID ga o'xshamaydi. Format: <code>std_xxxxx_xxxxx</code>. Iltimos, qaytadan yuboring.",
    )
    return
  }

  const student = await Student.findById(text)
  if (!student) {
    await send(chatId, "❌ Bunday ID bilan o'quvchi topilmadi. Tekshirib, qaytadan yuboring.")
    return
  }

  resetAttempts(chatId)

  const existing = await ParentLink.findOne({ chatId, studentId: student._id })
  if (existing) {
    await send(chatId, `ℹ️ Siz allaqachon <b>${esc(student.name)}</b> ni kuzatyapsiz.`)
    return
  }

  // Yangi bildirishnomalardan boshlash uchun "hozir" dan watermark qo'yamiz
  // (eski tarix qayta yuborilmaydi); o'rniga joriy holatni ko'rsatamiz.
  await ParentLink.create({
    chatId,
    studentId: student._id,
    parentName,
    lastNotifiedAt: new Date(),
  })

  await send(
    chatId,
    `✅ Ulandi! Endi siz <b>${esc(student.name)}</b> ning barcha o'quv faoliyati haqida xabar olib turasiz.\n\n${HELP}`,
  )
  await send(chatId, await buildSummary({ student }))
}

// ─── Bildirishnoma yuboruvchi (poller) ───────────────────────────────────────
async function pushPendingNotifications() {
  const links = await ParentLink.find().lean()
  if (links.length === 0) return

  const students = await Student.find({ _id: { $in: links.map((l) => l.studentId) } }).lean()
  const nameById = new Map(students.map((s) => [s._id, s.name]))

  for (const link of links) {
    const since = link.lastNotifiedAt ?? link.createdAt ?? new Date(0)
    const notes = await Notification.find({ studentId: link.studentId, createdAt: { $gt: since } })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean()
    if (notes.length === 0) continue

    const childName = nameById.get(link.studentId) ?? "Farzand"
    for (const n of notes) {
      await send(link.chatId, parentNotificationText(childName, n))
    }
    const newest = notes[notes.length - 1].createdAt
    await ParentLink.updateOne({ _id: link._id }, { lastNotifiedAt: newest })
  }
}

// ─── Long-polling tsikli ──────────────────────────────────────────────────────
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
