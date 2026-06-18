import { Payment } from "../models/Payment.js"
import { Group } from "../models/Group.js"
import { User } from "../models/User.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import {
  derivePaymentStatus,
  effectivePaidAmount,
} from "../services/paymentStatus.service.js"
import { resourceGroupIds } from "../services/group.service.js"
import { STAFF_PERMISSIONS } from "../constants/staffPermissions.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"

export const listPayments = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.studentId) filter.studentId = req.query.studentId
  if (req.query.groupId) {
    await assertOrgGroup(req.query.groupId, req)
    filter.groupId = req.query.groupId
  } else {
    const ids = await resourceGroupIds(req, STAFF_PERMISSIONS.PAYMENTS_VIEW_ALL)
    if (ids !== null) filter.groupId = { $in: ids }
  }
  const payments = await Payment.find(filter).sort({ dueDate: -1 })
  res.json(payments)
})

export const createPayment = asyncHandler(async (req, res) => {
  if (req.body.groupId) await assertOrgGroup(req.body.groupId, req)

  const amount = Math.max(0, req.body.amount ?? 0)
  let paidAmount = Math.max(0, req.body.paidAmount ?? 0)
  if (req.body.status === "paid" && paidAmount === 0) paidAmount = amount

  const payload = {
    ...req.body,
    amount,
    paidAmount,
    status:
      req.body.status ??
      derivePaymentStatus(amount, paidAmount, req.body.dueDate),
  }
  if (paidAmount > 0 && !payload.paidDate) payload.paidDate = new Date()

  const payment = await Payment.create(withOrgId(req, payload))
  const [student, group] = await Promise.all([
    payment.studentId ? User.findById(payment.studentId).select("name") : null,
    payment.groupId ? Group.findById(payment.groupId).select("name") : null,
  ])

  await recordAudit({
    req,
    action: "create",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
    details: {
      studentId: payment.studentId,
      studentName: student?.name ?? null,
      groupId: payment.groupId,
      groupName: group?.name ?? null,
      status: payment.status,
      amount: payment.amount,
    },
  })

  res.status(201).json(payment)
})

export const updatePayment = asyncHandler(async (req, res) => {
  const payment = await assertTenantDoc(Payment, req.params.id, req)
  await assertOrgGroup(payment.groupId, req)
  const updated = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true })

  await recordAudit({
    req,
    action: "update",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
    details: { patch: req.body },
  })

  res.json(updated)
})

export const deletePayment = asyncHandler(async (req, res) => {
  const payment = await assertTenantDoc(Payment, req.params.id, req)
  await assertOrgGroup(payment.groupId, req)
  await Payment.findByIdAndDelete(payment._id)

  await recordAudit({
    req,
    action: "delete",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
  })

  res.json({ ok: true })
})

export const markPaid = asyncHandler(async (req, res) => {
  const payment = await assertTenantDoc(Payment, req.params.id, req)
  await assertOrgGroup(payment.groupId, req)
  if (!payment) throw ApiError.notFound("Payment not found")

  const currentPaid = effectivePaidAmount(payment)
  const remaining = Math.max(0, payment.amount - currentPaid)
  const increment = req.body?.paidAmount ?? remaining
  const paidAmount = Math.min(payment.amount, currentPaid + increment)

  payment.paidAmount = paidAmount
  payment.status = derivePaymentStatus(payment.amount, paidAmount, payment.dueDate)
  if (paidAmount > 0) payment.paidDate = new Date()
  await payment.save()

  const [student, group] = await Promise.all([
    payment.studentId ? User.findById(payment.studentId).select("name") : null,
    payment.groupId ? Group.findById(payment.groupId).select("name") : null,
  ])

  await recordAudit({
    req,
    action: "mark_paid",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
    details: {
      studentId: payment.studentId,
      studentName: student?.name ?? null,
      groupId: payment.groupId,
      groupName: group?.name ?? null,
      amount: payment.amount,
      periodLabel: payment.periodLabel,
    },
  })

  res.json(payment)
})

export const markUnpaid = asyncHandler(async (req, res) => {
  const payment = await assertTenantDoc(Payment, req.params.id, req)
  await assertOrgGroup(payment.groupId, req)
  payment.paidAmount = 0
  payment.status = derivePaymentStatus(payment.amount, 0, payment.dueDate)
  payment.paidDate = undefined
  await payment.save()

  const [student, group] = await Promise.all([
    payment.studentId ? User.findById(payment.studentId).select("name") : null,
    payment.groupId ? Group.findById(payment.groupId).select("name") : null,
  ])

  await recordAudit({
    req,
    action: "mark_unpaid",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
    details: {
      studentId: payment.studentId,
      studentName: student?.name ?? null,
      groupId: payment.groupId,
      groupName: group?.name ?? null,
      amount: payment.amount,
      periodLabel: payment.periodLabel,
      newStatus: payment.status,
    },
  })

  res.json(payment)
})

/** Finance summary for a group. */
export const groupFinanceSummary = asyncHandler(async (req, res) => {
  await assertOrgGroup(req.params.id, req)
  const payments = await Payment.find({ groupId: req.params.id, ...tenantFilter(req) })
  let expectedTotal = 0
  let paidTotal = 0
  let overdueTotal = 0
  let pendingTotal = 0
  for (const p of payments) {
    expectedTotal += p.amount
    const paid = effectivePaidAmount(p)
    if (p.status === "paid" || paid >= p.amount) paidTotal += paid
    else if (paid > 0) paidTotal += paid
    else if (p.status === "overdue") overdueTotal += p.amount
    else pendingTotal += p.amount
  }
  res.json({ expectedTotal, paidTotal, overdueTotal, pendingTotal })
})
