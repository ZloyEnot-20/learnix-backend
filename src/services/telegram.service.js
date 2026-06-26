/**
 * Telegram yuborish + ota-onalar uchun xabar tuzish (umumiy modul).
 *
 * Bu modulni HAM backend (darhol yuborish uchun), HAM bot jarayoni (buyruqlar va
 * zaxira reconcile uchun) ishlatadi. Shu tariqa xabar formati bitta joyda turadi.
 *
 * Dublikatlardan himoya: har bir bildirishnoma har bir chatga ATIGA BIR MARTA
 * yuboriladi. Yuborishdan oldin `deliveredChatIds` ga chatId atomar qo'shiladi;
 * agar allaqachon bo'lsa (yoki boshqa jarayon ulgurgan bo'lsa) — yuborilmaydi.
 */
import { env } from "../config/env.js"
import { Notification } from "../models/Notification.js"
import { ParentLink } from "../models/ParentLink.js"
import { User } from "../models/User.js"
import { Submission } from "../models/Submission.js"
import { Homework } from "../models/Homework.js"

const API = `https://api.telegram.org/bot${env.telegram.botToken}`
const TG_TIMEOUT_MS = Number(process.env.TELEGRAM_API_TIMEOUT_MS ?? 15_000)
const KEYBOARD_CACHE_TTL_MS = 60_000

let reconcileRunning = false
const keyboardCache = new Map() // chatId -> { linked, expiresAt }

// ─── Telegram API ─────────────────────────────────────────────────────────────
export async function tg(method, body, { signal, timeoutMs = TG_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", () => controller.abort(), { once: true })
  }
  try {
    const res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description}`)
    return data.result
  } finally {
    clearTimeout(timer)
  }
}

export function sendMessage(chatId, text, extra = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  })
}

// ─── Doimiy pastki menyu (reply keyboard) ─────────────────────────────────────
export const BTN_STUDENT = "👨‍🎓 Men o'quvchiman"
export const BTN_PARENT = "👨‍👩‍👧 Men ota-onaman"
export const BTN_ORG = "🏢 Men tashkilotman"
export const BTN_TASKS = "📋 Vazifalar"
export const BTN_RESULTS = "📊 Natijalar"
export const BTN_CHILDREN = "👨‍👩‍👧 Farzandlarim"
export const BTN_HELP = "ℹ️ Yordam"
export const BTN_CONTACT = "📱 Telefon raqamni ulashish"

/** Yangi foydalanuvchi — rol tanlash + yordam. */
export const ROLE_KEYBOARD = {
  keyboard: [
    [{ text: BTN_STUDENT }],
    [{ text: BTN_PARENT }],
    [{ text: BTN_ORG }],
    [{ text: BTN_HELP }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

/** Ulangan ota-ona — navigatsiya + telefon ulashish. */
export const MENU_KEYBOARD = {
  keyboard: [
    [{ text: BTN_TASKS }, { text: BTN_RESULTS }],
    [{ text: BTN_CHILDREN }, { text: BTN_HELP }],
    [{ text: BTN_CONTACT, request_contact: true }],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

export const MENU_BUTTONS = {
  [BTN_TASKS]: "/vazifalar",
  [BTN_RESULTS]: "/natijalar",
  [BTN_CHILDREN]: "/farzandlarim",
  [BTN_HELP]: "/yordam",
}

/** Chat holatiga qarab doimiy klaviaturani qaytaradi (qisqa TTL kesh). */
export async function getKeyboardForChat(chatId) {
  const key = String(chatId)
  const cached = keyboardCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.linked ? MENU_KEYBOARD : ROLE_KEYBOARD
  }
  const linked = await ParentLink.exists({ chatId: key })
  keyboardCache.set(key, { linked: Boolean(linked), expiresAt: Date.now() + KEYBOARD_CACHE_TTL_MS })
  return linked ? MENU_KEYBOARD : ROLE_KEYBOARD
}

/** ParentLink o'zgarganda keshni tozalash. */
export function invalidateKeyboardCache(chatId) {
  if (chatId != null) keyboardCache.delete(String(chatId))
  else keyboardCache.clear()
}

/** Xabar yuboradi va doimiy menyuni biriktiradi (agar boshqa markup berilmagan bo'lsa). */
export async function sendMessageWithMenu(chatId, text, extra = {}) {
  const markup = extra.reply_markup ?? (await getKeyboardForChat(chatId))
  return sendMessage(chatId, text, { ...extra, reply_markup: markup })
}

// ─── Matn yordamchilari ─────────────────────────────────────────────────────────
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function fmtDate(date) {
  if (!date) return "—"
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

const MONTHS_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
]

/** ISO yoki Date → «12 aprel 2026 yil». */
export function fmtDateUzLong(date) {
  if (!date) return "—"
  const iso = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, y, m, day] = iso
    return `${Number(day)} ${MONTHS_UZ[Number(m) - 1]} ${y} yil`
  }
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return String(date)
  return `${d.getUTCDate()} ${MONTHS_UZ[d.getUTCMonth()]} ${d.getUTCFullYear()} yil`
}

/** Sarlavha + qatorlardan toza "karta" tuzish (bo'sh qatorlar tashlanadi). */
export function card(title, lines = []) {
  return [title, ...lines.filter(Boolean)].join("\n")
}

export const SUBJECT_EMOJI = {
  reading: "📖",
  listening: "🎧",
  writing: "✍️",
  speaking: "🗣️",
  grammar: "🔤",
  vocabulary: "📝",
}

// Ota-onalar uchun oddiy, tushunarli fan nomlari (sleng va murakkab so'zlarsiz).
const SUBJECT_LABEL = {
  reading: "O'qish",
  listening: "Tinglash",
  writing: "Yozish",
  speaking: "Gapirish",
  grammar: "Grammatika",
  vocabulary: "So'zlar (lug'at)",
}

export function subjectLabel(subject) {
  return SUBJECT_LABEL[subject] ?? "Dars"
}

// Vazifa holatining oddiy tavsifi.
const STATUS_PLAIN = {
  pending: "Hali bajarilmagan",
  in_progress: "Bajarilmoqda",
  submitted: "Bajarildi",
  graded: "Tekshirildi",
}

function attendanceStatusLine(status, childName) {
  const name = esc(childName)
  switch (status) {
    case "present":
      return `Farzandingiz <b>${name}</b> darsga keldi ✅`
    case "absent":
      return `Farzandingiz <b>${name}</b> darsga kelmadi ❌`
    case "late":
      return `Farzandingiz <b>${name}</b> darsga kechikib keldi ⏰`
    case "excused":
      return `Farzandingiz <b>${name}</b> sababli yo'q 📋`
    default:
      return `Farzandingiz <b>${name}</b> uchun davomat belgilandi 📌`
  }
}

export const STATUS_UZ = {
  pending: "🕓 Boshlanmagan",
  in_progress: "⏳ Bajarilyapti",
  submitted: "📨 Topshirilgan",
  graded: "✅ Baholangan",
}

/** Bitta bildirishnomadan ota-ona uchun toza, oddiy o'zbekcha karta tuzish. */
export function parentNotificationText(childName, note) {
  const d = note.data ?? {}
  const taskName =
    d.homeworkTitle ??
    (note.title?.includes(":") ? note.title.split(":").slice(1).join(":").trim() : note.title)

  const child = `👤 Farzandingiz: <b>${esc(childName)}</b>`
  const subjLine = d.subject ? `📚 Mavzu: ${esc(subjectLabel(d.subject))}` : null
  const taskLine = taskName ? `📝 Vazifa: <b>${esc(taskName)}</b>` : null

  switch (note.type) {
    case "homework": {
      const due = d.dueAt ? `🗓 Topshirish muddati: <b>${fmtDate(d.dueAt)}</b>` : null
      const status = `📌 Holati: ${STATUS_PLAIN[d.status] ?? "Hali bajarilmagan"}`
      return card("📋 <b>Yangi uy vazifasi berildi</b>", ["", child, subjLine, taskLine, due, status])
    }
    case "result": {
      const isCompleted = d.status === "submitted" || /complete/i.test(note.title ?? "")
      // Sarlavhadan keyin bo'sh qator (card() bo'sh stringlarni tashlab yuboradi,
      // shuning uchun "\n" ni sarlavhaning o'ziga qo'shamiz).
      const head = isCompleted
        ? "✅ <b>Farzandingiz vazifani bajardi</b>\n"
        : "📊 <b>Vazifa tekshirildi</b>"
      const score =
        typeof d.score === "number"
          ? `⭐ Baho: <b>${d.score.toFixed(1)}</b>`
          : (() => {
              const m = (note.message ?? "").match(/(\d(?:\.\d)?)/)
              return m ? `⭐ Baho: <b>${m[1]}</b>` : null
            })()
      const correct =
        typeof d.correctCount === "number" && typeof d.totalQuestions === "number"
          ? `✔️ To'g'ri javoblar: ${d.correctCount}/${d.totalQuestions}`
          : null
      return card(head, ["", child, subjLine, taskLine, correct])
    }
    case "reminder":
      return card("⏰ <b>Eslatma</b>", ["", child, subjLine, taskLine])
    case "achievement":
      return card("🏆 <b>Yangi yutuq</b>", ["", child, subjLine, taskLine])
    case "entry_test":
      return card("📝 <b>Kirish testi</b>", ["", child, subjLine, taskLine])
    case "attendance": {
      const dateLine = d.lessonDate
        ? `Dars sanasi: <b>${esc(fmtDateUzLong(d.lessonDate))}</b>`
        : null
      const statusLine = attendanceStatusLine(d.status, childName)
      const canceledLine = d.canceled ? "⚠️ Dars bekor qilindi" : null
      return [
        "<b>Davomat haqida xabar</b>",
        "",
        statusLine,
        dateLine ? "" : null,
        dateLine,
        canceledLine,
      ]
        .filter((line) => line !== null)
        .join("\n")
    }
    default:
      return card("🔔 <b>Xabar</b>", ["", child, subjLine, taskLine])
  }
}

/**
 * O'quvchining hali bajarilmagan (pending / in_progress) vazifalari ro'yxati.
 * Bajarilgan vazifa haqidagi xabar oxiriga qo'shiladi.
 */
async function remainingTasksBlock(studentId) {
  const subs = await Submission.find({
    studentId,
    status: { $in: ["pending", "in_progress"] },
  }).lean()
  if (subs.length === 0) return "🎉 Boshqa vazifa qolmadi"

  const hwById = new Map(
    (await Homework.find({ _id: { $in: subs.map((s) => s.homeworkId) } }).lean()).map((h) => [
      h._id,
      h,
    ]),
  )
  const items = subs
    .map((s) => hwById.get(s.homeworkId))
    .filter(Boolean)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .map((hw) => `• ${esc(hw.title)} — ${fmtDate(hw.dueAt)} gacha`)

  if (items.length === 0) return "🎉 Boshqa vazifa qolmadi"
  return card(`📌 <b>Qolgan vazifalar (${items.length})</b>`, items)
}

/**
 * Bildirishnoma matnini tuzadi. Vazifa bajarilgani haqidagi xabarga qo'shimcha
 * "Qolgan vazifalar" ro'yxati biriktiriladi (DB dan joriy holat bo'yicha).
 */
async function composeMessage(childName, note) {
  const base = parentNotificationText(childName, note)
  const isCompletedResult =
    note.type === "result" &&
    (note.data?.status === "submitted" || /complete/i.test(note.title ?? ""))
  if (!isCompletedResult || !note.studentId) return base
  const remaining = await remainingTasksBlock(note.studentId)
  return `${base}\n\n${remaining}`
}

// ─── Yetkazib berish (idempotent) ────────────────────────────────────────────
/**
 * Bitta chatga bitta bildirishnomani ATIGA BIR MARTA yuboradi.
 * Avval atomar "egallab olamiz" (deliveredChatIds ga qo'shamiz); faqat shu
 * jarayon egallasa — yuboramiz. Shu bois bir nechta jarayon (backend + bot)
 * baravar ishlasa ham dublikat bo'lmaydi.
 */
async function deliverToChat(chatId, childName, note) {
  const claim = await Notification.updateOne(
    { _id: note._id, deliveredChatIds: { $ne: chatId } },
    { $addToSet: { deliveredChatIds: chatId } },
  )
  if (claim.modifiedCount !== 1) return // boshqa jarayon allaqachon yubordi
  try {
    await sendMessage(chatId, await composeMessage(childName, note), {
      reply_markup: await getKeyboardForChat(chatId),
    })
  } catch (err) {
    // Yuborilmadi — keyingi reconcile qayta urinishi uchun belgini qaytaramiz.
    await Notification.updateOne({ _id: note._id }, { $pull: { deliveredChatIds: chatId } }).catch(
      () => {},
    )
    throw err
  }
}

/**
 * Yangi yaratilgan bildirishnomani shu o'quvchining barcha ota-onalariga DARHOL
 * yuboradi. Backend `notify()` dan keyin chaqiriladi (eng-best-effort).
 */
export async function deliverNotification(note) {
  if (!env.telegram.botToken || !note?.studentId) return
  const links = await ParentLink.find({ studentId: note.studentId }).lean()
  if (links.length === 0) return

  const student = await User.findOne({ _id: note.studentId, type: "student" }).lean()
  const childName = student?.name ?? "Farzand"

  await Promise.all(
    links.map((link) =>
      deliverToChat(link.chatId, childName, note)
        .then(() =>
          ParentLink.updateOne(
            { _id: link._id, lastNotifiedAt: { $lt: note.createdAt } },
            { lastNotifiedAt: note.createdAt },
          ).catch(() => {}),
        )
        .catch((err) => console.error("[tg] deliver error:", err.message)),
    ),
  )
}

/**
 * Zaxira: yuborilmay qolgan bildirishnomalarni yetkazadi (masalan, darhol
 * yuborish vaqtida Telegram ishlamay qolgan bo'lsa). Idempotent — dublikat yo'q.
 */
export async function reconcilePending(limitPerLink = 20) {
  if (!env.telegram.botToken || reconcileRunning) return
  reconcileRunning = true
  try {
    const links = await ParentLink.find().lean()
    if (links.length === 0) return

    const students = await User.find({
      _id: { $in: links.map((l) => l.studentId) },
      type: "student",
    }).lean()
    const nameById = new Map(students.map((s) => [s._id, s.name]))

    for (const link of links) {
      const since = link.lastNotifiedAt ?? link.createdAt ?? new Date(0)
      const notes = await Notification.find({
        studentId: link.studentId,
        createdAt: { $gt: since },
        deliveredChatIds: { $ne: link.chatId },
      })
        .sort({ createdAt: 1 })
        .limit(limitPerLink)
        .lean()
      if (notes.length === 0) continue

      const childName = nameById.get(link.studentId) ?? "Farzand"
      let newest = since
      for (const n of notes) {
        try {
          await deliverToChat(link.chatId, childName, n)
          if (new Date(n.createdAt) > new Date(newest)) newest = n.createdAt
        } catch (err) {
          console.error("[tg] reconcile send error:", err.message)
        }
      }
      if (new Date(newest) > new Date(since)) {
        await ParentLink.updateOne({ _id: link._id }, { lastNotifiedAt: newest }).catch(() => {})
      }
    }
  } finally {
    reconcileRunning = false
  }
}

/** Zaxira reconcile — faqat backend jarayonida (webhook rejimida). */
export function startReconcileTimer() {
  if (!env.telegram.botToken) return () => {}
  reconcilePending().catch((err) => console.error("[tg] reconcile error:", err.message))
  const timer = setInterval(() => {
    reconcilePending().catch((err) => console.error("[tg] reconcile error:", err.message))
  }, env.telegram.reconcileIntervalMs)
  return () => clearInterval(timer)
}
