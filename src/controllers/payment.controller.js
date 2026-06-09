import { Payment } from "../models/Payment.js"
import { User } from "../models/User.js"
import { Group } from "../models/Group.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { recordAudit } from "../services/audit.service.js"
import {
  assertOrgGroup,
  assertTenantDoc,
  tenantFilter,
  withOrgId,
} from "../services/tenantScope.service.js"

export const listPayments = asyncHandler(async (req, res) => {
  const filter = { ...tenantFilter(req) }
  if (req.query.studentId) filter.studentId = req.query.studentId
  if (req.query.groupId) filter.groupId = req.query.groupId
  const payments = await Payment.find(filter).sort({ dueDate: -1 })
  res.json(payments)
})

export const createPayment = asyncHandler(async (req, res) => {
  if (req.body.groupId) await assertOrgGroup(req.body.groupId, req)
  const payment = await Payment.create(withOrgId(req, req.body))
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
  await assertTenantDoc(Payment, req.params.id, req)
  const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true })

  await recordAudit({
    req,
    action: "update",
    category: "payments",
    targetType: "payment",
    targetId: payment._id,
    targetLabel: `${payment.amount}`,
    details: { patch: req.body },
  })

  res.json(payment)
})

export const deletePayment = asyncHandler(async (req, res) => {
  const payment = await assertTenantDoc(Payment, req.params.id, req)
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
  await assertTenantDoc(Payment, req.params.id, req)
  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    { status: "paid", paidDate: new Date() },
    { new: true },
  )
  if (!payment) throw ApiError.notFound("Payment not found")

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
  const overdue = new Date(payment.dueDate).getTime() < Date.now()
  payment.status = overdue ? "overdue" : "pending"
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
    if (p.status === "paid") paidTotal += p.amount
    else if (p.status === "overdue") overdueTotal += p.amount
    else pendingTotal += p.amount
  }
  res.json({ expectedTotal, paidTotal, overdueTotal, pendingTotal })
})
