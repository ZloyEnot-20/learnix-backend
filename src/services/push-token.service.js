import { PushToken } from "../models/PushToken.js"

export async function registerPushToken(studentId, orgId, { token, platform }) {
  const now = new Date()
  const existing = await PushToken.findOne({ token })

  if (existing) {
    existing.studentId = studentId
    existing.orgId = orgId ?? null
    existing.platform = platform
    existing.lastUsedAt = now
    await existing.save()
    return existing
  }

  return PushToken.create({
    studentId,
    orgId: orgId ?? null,
    token,
    platform,
    lastUsedAt: now,
  })
}

export async function unregisterPushToken(studentId, token) {
  await PushToken.deleteOne({ studentId, token })
}

export async function deletePushToken(token) {
  await PushToken.deleteOne({ token })
}

export async function deletePushTokensForStudent(studentId) {
  await PushToken.deleteMany({ studentId })
}

export async function listPushTokensForStudent(studentId) {
  return PushToken.find({ studentId }).select("token platform lastUsedAt").lean()
}
