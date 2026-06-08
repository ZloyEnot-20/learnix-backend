/**
 * Learnix Telegram bot — ota-onalar uchun (parent notifications).
 *
 * G'oya: bot ota-onalarga farzandining BARCHA o'quv faoliyati haqida o'zbek
 * tilida xabar beradi (yangi vazifalar, yakunlangan ishlar, baholar, eslatmalar).
 *
 * Oqim:
 *   1. /start — bot markaz bergan bir martalik "taklif kodini" so'raydi.
 *   2. Kod to'g'ri va amal qilsa — chat shu o'quvchiga "ulanadi" (ParentLink) va
 *      kod ishlatilgan deb belgilanadi. Bitta chat bir nechta farzandni
 *      kuzatishi mumkin. Kod noto'g'ri bo'lsa — qayta so'raydi (cheklov bilan).
 *   3. Bildirishnomalar ESA backend tomonidan DARHOL yuboriladi (notify() →
 *      telegram.service). Bu bot faqat zaxira sifatida vaqti-vaqti bilan
 *      yuborilmay qolgan xabarlarni yetkazadi (reconcilePending, idempotent).
 *
 * Ishga tushirish:  npm run dev (pm2)  yoki  npm run bot
 */
import "../config/mongoose.js"
import { env } from "../config/env.js"
import { connectDB, disconnectDB } from "../config/db.js"
import { User } from "../models/User.js"
import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { ParentLink } from "../models/ParentLink.js"
import { BotInvite, normaliseInviteCode } from "../models/BotInvite.js"
import { StudentClaim } from "../models/StudentClaim.js"
import {
  tg,
  sendMessageWithMenu,
  esc,
  fmtDate,
  card,
  SUBJECT_EMOJI,
  STATUS_UZ,
  reconcilePending,
  BTN_STUDENT,
  BTN_PARENT,
  BTN_CONTACT,
  BTN_HELP,
  MENU_BUTTONS,
} from "../services/telegram.service.js"

const TOKEN = env.telegram.botToken

// Bir martalik taklif kodi: 8 ta belgi (harf/raqam). Ota-ona o'quvchi ID sini
// emas, balki markaz bergan kodni yuboradi — bu xavfsizroq.
const INVITE_CODE_RE = /^[A-Z0-9]{8}$/
// O'quvchi tasdiqlash kodi: 6 xonali raqam (markaz bergan bir martalik kod).
const CLAIM_CODE_RE = /^\d{6}$/

// Foydalanuvchi /start dan keyin tanlagan rol (o'quvchi yoki ota-ona).
// Kodni qaysi oqimda qabul qilishni aniqlash uchun ishlatiladi.
const ROLE_STUDENT = "student"
const ROLE_PARENT = "parent"
const pendingRole = new Map() // chatId -> "student" | "parent"

// Muvaffaqiyatsiz ulanish urinishlari uchun cheklov (kodlarni terib topishga qarshi).
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 60_000
const attempts = new Map() // chatId -> { count, windowStart }

// Buyruq javoblari uchun: yuborish xatosi botni yiqitmasligi kerak.
// Har bir javobda doimiy pastki menyu biriktiriladi.
function send(chatId, text, extra = {}) {
  return sendMessageWithMenu(chatId, text, extra).catch((err) =>
    console.error("[bot] sendMessage error:", err.message),
  )
}

const HELP =
  "<b>Buyruqlar</b>\n" +
  "/vazifalar — joriy vazifalar\n" +
  "/natijalar — oxirgi natijalar\n" +
  "/farzandlarim — farzandlar ro'yxati\n" +
  "/uzish — kuzatuvni to'xtatish\n" +
  "/yordam — yordam"

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
  const students = await User.find({
    _id: { $in: links.map((l) => l.studentId) },
    role: "student",
  }).lean()
  const byId = new Map(students.map((s) => [s._id, s]))
  return links
    .map((link) => ({ link, student: byId.get(link.studentId) }))
    .filter((x) => x.student)
}

/**
 * O'quvchi 6 xonali tasdiqlash kodini kiritganda — uning login/parolini yuboradi.
 * Kod bir martalik: ishlatilgach belgilanadi va vaqtinchalik parol o'chiriladi.
 */
async function redeemStudentClaim(chatId, rawCode) {
  const code = String(rawCode ?? "").replace(/\D/g, "")
  if (!CLAIM_CODE_RE.test(code)) {
    await send(
      chatId,
      "❌ Bu 6 xonali kodga o'xshamaydi. Markaz bergan kodni yuboring (masalan: <code>048213</code>).",
    )
    return
  }

  const claim = await StudentClaim.findOne({ code, usedAt: null }).select("+password")
  if (!claim) {
    await send(chatId, "❌ Bunday kod topilmadi yoki allaqachon ishlatilgan. Markazga murojaat qiling.")
    return
  }
  if (new Date(claim.expiresAt).getTime() < Date.now()) {
    await send(chatId, "⌛ Bu kodning muddati tugagan. Markazdan yangi kod so'rang.")
    return
  }

  const student = await User.findOne({ _id: claim.studentId, role: "student" }).lean()
  if (!student) {
    await send(chatId, "❌ Bu kodga bog'langan o'quvchi topilmadi. Markazga murojaat qiling.")
    return
  }

  const password = claim.password
  // Bir martalik: kodni ishlatilgan deb belgilaymiz va parolni o'chiramiz.
  claim.usedAt = new Date()
  claim.usedByChatId = chatId
  claim.password = null
  await claim.save()

  resetAttempts(chatId)
  pendingRole.delete(chatId)

  await send(
    chatId,
    card("🔑 <b>Kirish ma'lumotlaringiz</b>", [
      "",
      `👤 ${esc(student.name)}`,
      `Login: <code>${esc(student.login)}</code>`,
      `Parol: <code>${esc(password)}</code>`,
      "",
      "Saytga shu login va parol bilan kiring. Parolni hech kimga bermang.",
    ]),
  )
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

  const header = `📋 <b>Vazifalar</b> · ${esc(childName)}`
  if (active.length === 0) {
    return card(header, ["", "Faol vazifa yo'q ✅"])
  }
  const items = active.map(({ sub, hw }) => {
    const emoji = SUBJECT_EMOJI[hw.subject] ?? "📚"
    return card(`${emoji} <b>${esc(hw.title)}</b>`, [
      `${STATUS_UZ[sub.status]}`,
      `🗓 ${fmtDate(hw.dueAt)} gacha`,
    ])
  })
  return `${header}\n\n${items.join("\n\n")}`
}

async function buildResultsMessage(studentId, childName) {
  const subs = await Submission.find({
    studentId,
    status: { $in: ["submitted", "graded"] },
  })
    .sort({ submittedAt: -1 })
    .limit(10)
    .lean()
  const header = `📊 <b>Natijalar</b> · ${esc(childName)}`
  if (subs.length === 0) {
    return card(header, ["", "Hali natija yo'q"])
  }
  const hwById = new Map(
    (await Homework.find({ _id: { $in: subs.map((s) => s.homeworkId) } }).lean()).map((h) => [
      h._id,
      h,
    ]),
  )
  const items = subs.map((s) => {
    const hw = hwById.get(s.homeworkId)
    const title = hw ? esc(hw.title) : "Vazifa"
    const score = typeof s.score === "number" ? `Ball: <b>${s.score.toFixed(1)}</b>` : null
    const acc =
      s.attempt && s.attempt.totalQuestions
        ? `To'g'ri javoblar: ${s.attempt.correctCount}/${s.attempt.totalQuestions}`
        : null
    return card(`<b>${title}</b>`, [STATUS_UZ[s.status], score, acc])
  })
  return `${header}\n\n${items.join("\n\n")}`
}

async function buildSummary(child) {
  const [tasks, results] = await Promise.all([
    buildTasksMessage(child.student._id, child.student.name),
    buildResultsMessage(child.student._id, child.student.name),
  ])
  return `${tasks}\n\n${results}`
}

// ─── Xabarlarni qayta ishlash ────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id)

  // Ota-ona telefon raqamini ulashganda — barcha ulanishlarga saqlaymiz.
  if (msg.contact) {
    // Faqat foydalanuvchining o'z kontakti qabul qilinadi (boshqa odamniki emas).
    if (msg.contact.user_id && String(msg.contact.user_id) !== String(msg.from?.id)) {
      return void send(chatId, "❗️ Iltimos, faqat <b>o'z</b> telefon raqamingizni ulashing.")
    }
    const phone = msg.contact.phone_number
    const res = await ParentLink.updateMany({ chatId }, { phone })
    if (!res.matchedCount) {
      return void send(chatId, "Avval taklif kodini yuborib, farzandingizni ulang.")
    }
    return void send(chatId, "✅ Rahmat! Telefon raqamingiz saqlandi.")
  }

  let text = (msg.text ?? "").trim()
  if (!text) return

  // Pastdagi navigatsiya tugmalari — tegishli buyruqqa aylantiramiz.
  if (MENU_BUTTONS[text]) text = MENU_BUTTONS[text]

  const username = msg.from?.username ? `@${msg.from.username}` : undefined
  const parentName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || undefined

  // Buyruqlar
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "")
    const children = await getChildren(chatId)

    if (cmd === "/start") {
      pendingRole.delete(chatId)
      if (children.length > 0) {
        const names = children.map((c) => `• ${esc(c.student.name)}`).join("\n")
        await send(
          chatId,
          card("👋 <b>Xush kelibsiz!</b>", [
            "",
            "Kuzatilayotgan farzandlar:",
            names,
            "",
            "Pastdagi menyudan foydalaning 👇",
            "Yana farzand qo'shish uchun yangi taklif kodini yuboring.",
          ]),
        )
      } else {
        await send(
          chatId,
          card("👋 <b>Learnix botiga xush kelibsiz!</b>", [
            "",
            "Siz kimsiz? Quyidan tanlang 👇",
            "",
            `${BTN_STUDENT} — kirish login va parolingizni olasiz.`,
            `${BTN_PARENT} — farzandingiz faoliyatini kuzatasiz.`,
          ]),
        )
      }
      return
    }

    if (cmd === "/yordam") return void send(chatId, HELP)

    if (children.length === 0) {
      await send(
        chatId,
        "🔒 Avval farzandingizni ulang — markaz bergan <b>taklif kodini</b> yuboring.",
      )
      return
    }

    if (cmd === "/vazifalar") {
      for (const c of children)
        await send(chatId, await buildTasksMessage(c.student._id, c.student.name))
      return
    }
    if (cmd === "/natijalar") {
      for (const c of children)
        await send(chatId, await buildResultsMessage(c.student._id, c.student.name))
      return
    }
    if (cmd === "/farzandlarim") {
      const names = children
        .map((c) => `• <b>${esc(c.student.name)}</b>\n  ${fmtDate(c.link.createdAt)} dan beri`)
        .join("\n\n")
      return void send(chatId, card("👨‍👩‍👧 <b>Farzandlar</b>", ["", names]))
    }
    if (cmd === "/uzish") {
      await ParentLink.deleteMany({ chatId })
      return void send(
        chatId,
        card("🔌 <b>Kuzatuv to'xtatildi</b>", ["", "Qayta ulanish uchun taklif kodini yuboring."]),
      )
    }
    return void send(chatId, `❓ Noma'lum buyruq.\n\n${HELP}`)
  }

  // ─── Rolni tanlash (o'quvchi yoki ota-ona) ────────────────────────────────
  if (text === BTN_STUDENT) {
    pendingRole.set(chatId, ROLE_STUDENT)
    await send(
      chatId,
      card("👨‍🎓 <b>O'quvchi</b>", [
        "",
        "Markaz bergan <b>6 xonali kodni</b> yuboring (masalan: <code>048213</code>).",
        "Kodni tasdiqlasangiz — login va parolingizni yuboraman.",
      ]),
    )
    return
  }
  if (text === BTN_PARENT) {
    pendingRole.set(chatId, ROLE_PARENT)
    await send(
      chatId,
      card("👨‍👩‍👧 <b>Ota-ona</b>", [
        "",
        "Markaz bergan <b>8 xonali taklif kodini</b> yuboring (masalan: <code>QK7M2P9D</code>).",
      ]),
    )
    return
  }

  // ─── Kodni qabul qilish (rolga yoki format bo'yicha) ──────────────────────
  if (tooManyAttempts(chatId)) {
    await send(chatId, "⛔ Juda ko'p urinish. Iltimos, bir daqiqadan so'ng qayta urinib ko'ring.")
    return
  }

  const role = pendingRole.get(chatId)
  const looksLikeClaim = CLAIM_CODE_RE.test(text.replace(/\D/g, "")) && text.replace(/\D/g, "") === text.replace(/\s/g, "")

  // O'quvchi kodi: rol tanlangan bo'lsa yoki matn 6 xonali raqam bo'lsa.
  if (role === ROLE_STUDENT || (!role && looksLikeClaim)) {
    await redeemStudentClaim(chatId, text)
    return
  }

  const code = normaliseInviteCode(text)
  if (!INVITE_CODE_RE.test(code)) {
    await send(
      chatId,
      "❌ Bu taklif kodiga o'xshamaydi. Kod 8 ta belgidan iborat (masalan: <code>QK7M2P9D</code>). Iltimos, qaytadan yuboring.",
    )
    return
  }

  const invite = await BotInvite.findOne({ code })
  if (!invite) {
    await send(chatId, "❌ Bunday taklif kodi topilmadi. Tekshirib, qaytadan yuboring.")
    return
  }
  if (invite.usedAt) {
    await send(chatId, "⚠️ Bu kod allaqachon ishlatilgan. Markazdan yangi kod so'rang.")
    return
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await send(chatId, "⌛ Bu kodning muddati tugagan. Markazdan yangi kod so'rang.")
    return
  }

  const student = await User.findOne({ _id: invite.studentId, role: "student" })
  if (!student) {
    await send(chatId, "❌ Bu kodga bog'langan o'quvchi topilmadi. Markazga murojaat qiling.")
    return
  }

  resetAttempts(chatId)
  pendingRole.delete(chatId)

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
    username,
    lastNotifiedAt: new Date(),
  })
  // Kodni bir martalik qilib belgilash.
  invite.usedAt = new Date()
  invite.usedByChatId = chatId
  invite.parentName = parentName ?? null
  await invite.save()

  await send(
    chatId,
    card("✅ <b>Ulandi</b>", [
      "",
      `Endi siz <b>${esc(student.name)}</b> faoliyatini kuzatasiz.`,
      "",
      `Telefon raqamingizni ulashish uchun pastdagi «${BTN_CONTACT}» tugmasini bosing 👇`,
    ]),
  )
  await send(chatId, await buildSummary({ student }))
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

  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Botni ishga tushirish" },
      { command: "vazifalar", description: "Joriy vazifalar" },
      { command: "natijalar", description: "Oxirgi natijalar" },
      { command: "farzandlarim", description: "Farzandlar ro'yxati" },
      { command: "yordam", description: "Yordam" },
      { command: "uzish", description: "Kuzatuvni to'xtatish" },
    ],
  }).catch((err) => console.warn("[bot] setMyCommands:", err.message))

  // Bildirishnomalar backend tomonidan DARHOL yuboriladi. Bu yerda faqat zaxira:
  // ishga tushganda va vaqti-vaqti bilan yuborilmay qolganlarini yetkazamiz.
  reconcilePending().catch((err) => console.error("[bot] reconcile error:", err.message))
  const reconcileTimer = setInterval(() => {
    reconcilePending().catch((err) => console.error("[bot] reconcile error:", err.message))
  }, env.telegram.reconcileIntervalMs)

  const shutdown = async () => {
    running = false
    clearInterval(reconcileTimer)
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
