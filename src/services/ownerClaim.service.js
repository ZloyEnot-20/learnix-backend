import { getOwnerClaimModel } from "../models/platform/OwnerClaim.js"
import { getPlatformUserModel } from "../models/platform/PlatformUser.js"
import { getOrganizationModel } from "../models/platform/Organization.js"
import { User } from "../models/User.js"
import { hashPassword } from "../utils/password.js"
import { esc, card } from "./telegram.service.js"

const CLAIM_CODE_RE = /^\d{6}$/

/**
 * Org owner enters a 6-digit confirmation code in the bot and receives login +
 * password for their tenant.
 */
export async function redeemOwnerClaim(chatId, rawCode) {
  const code = String(rawCode ?? "").replace(/\D/g, "")
  if (!CLAIM_CODE_RE.test(code)) {
    return {
      ok: false,
      message: card("❌ <b>Noto'g'ri kod</b>", [
        "",
        "Bu 6 xonali kodga o'xshamaydi. Platforma bergan kodni yuboring (masalan: <code>048213</code>).",
      ]),
    }
  }

  const OwnerClaim = getOwnerClaimModel()
  const claim = await OwnerClaim.findOne({ code, usedAt: null }).select("+password")
  if (!claim) {
    return {
      ok: false,
      message: "❌ Bunday kod topilmadi yoki allaqachon ishlatilgan. Platforma administratoriga murojaat qiling.",
    }
  }
  if (new Date(claim.expiresAt).getTime() < Date.now()) {
    return {
      ok: false,
      message: "⌛ Bu kodning muddati tugagan. Platformadan yangi kod so'rang.",
    }
  }

  const PlatformUser = getPlatformUserModel()
  const Organization = getOrganizationModel()
  const [owner, org] = await Promise.all([
    PlatformUser.findById(claim.ownerId),
    Organization.findById(claim.orgId),
  ])
  if (!owner || owner.role !== "owner") {
    return {
      ok: false,
      message: "❌ Tashkilot egasi topilmadi. Platforma administratoriga murojaat qiling.",
    }
  }

  const password = claim.password
  claim.usedAt = new Date()
  claim.usedByChatId = chatId
  claim.password = null
  await claim.save()

  const login = owner.login ?? owner.email.split("@")[0]
  const email = owner.email?.trim().toLowerCase() ?? `${login}@learnix.local`

  // Fallback for orgs created before tenant provisioning was wired up.
  const tenantExisting = await User.findOne({
    $or: [{ login: login.toLowerCase() }, { email }],
  })
  const passwordHash = await hashPassword(password)
  if (tenantExisting) {
    tenantExisting.name = owner.name
    tenantExisting.login = login.toLowerCase()
    tenantExisting.email = email
    tenantExisting.role = "admin"
    tenantExisting.passwordHash = passwordHash
    await tenantExisting.save()
  } else {
    await User.create({
      login: login.toLowerCase(),
      email,
      name: owner.name,
      role: "admin",
      passwordHash,
      isPremium: true,
    })
  }

  const loginLabel = login
  const orgLabel = org ? `${org.name} (${org.subdomain}.learnix)` : "tashkilotingiz"

  return {
    ok: true,
    message: card("🔑 <b>Tashkilot kirish ma'lumotlari</b>", [
      "",
      `🏢 ${esc(orgLabel)}`,
      `👤 ${esc(owner.name)}`,
      `Login: <code>${esc(loginLabel)}</code>`,
      `Parol: <code>${esc(password)}</code>`,
      "",
      "Saytga shu login va parol bilan kiring. Parolni hech kimga bermang.",
    ]),
  }
}
