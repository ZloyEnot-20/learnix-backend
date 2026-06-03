import { Payment } from "../models/Payment.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

export const listPayments = asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.studentId) filter.studentId = req.query.studentId
  if (req.query.groupId) filter.groupId = req.query.groupId
  const payments = await Payment.find(filter).sort({ dueDate: -1 })
  res.json(payments)
})

export const createPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.create(req.body)
  res.status(201).json(payment)
})

export const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, { new: true })
  if (!payment) throw ApiError.notFound("Payment not found")
  res.json(payment)
})

export const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndDelete(req.params.id)
  if (!payment) throw ApiError.notFound("Payment not found")
  res.json({ ok: true })
})

export const markPaid = asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    { status: "paid", paidDate: new Date() },
    { new: true },
  )
  if (!payment) throw ApiError.notFound("Payment not found")
  res.json(payment)
})

export const markUnpaid = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
  if (!payment) throw ApiError.notFound("Payment not found")
  const overdue = new Date(payment.dueDate).getTime() < Date.now()
  payment.status = overdue ? "overdue" : "pending"
  payment.paidDate = undefined
  await payment.save()
  res.json(payment)
})

/** Finance summary for a group. */
export const groupFinanceSummary = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ groupId: req.params.id })
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
