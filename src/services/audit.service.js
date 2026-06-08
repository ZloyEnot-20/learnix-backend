import { AuditLog } from "../models/AuditLog.js"

function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim()
  }
  return req?.ip ?? null
}

/**
 * Persist an audit event. Failures are logged but never block the request.
 */
export async function recordAudit({
  req,
  actor,
  action,
  category,
  targetType,
  targetId,
  targetLabel,
  details,
}) {
  try {
    const a = actor ?? req?.user
    await AuditLog.create({
      action,
      category,
      actorId: a?.id ?? a?._id ?? null,
      actorName: a?.name ?? "System",
      actorRole: a?.role ?? null,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      targetLabel: targetLabel ?? null,
      details: details ?? null,
      ipAddress: req ? clientIp(req) : null,
      userAgent: req?.headers?.["user-agent"] ?? null,
    })
  } catch (err) {
    console.error("[audit]", err)
  }
}
