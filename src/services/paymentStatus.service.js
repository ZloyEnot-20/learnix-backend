/** Derive payment status from expected amount, collected amount, and due date. */
export function derivePaymentStatus(amount, paidAmount = 0, dueDate) {
  const paid = Math.max(0, paidAmount ?? 0)
  const expected = Math.max(0, amount ?? 0)
  if (paid >= expected && expected > 0) return "paid"
  if (paid > 0) return "partial"
  const overdue = dueDate && new Date(dueDate).getTime() < Date.now()
  return overdue ? "overdue" : "pending"
}

/** Effective collected amount (supports legacy records without paidAmount). */
export function effectivePaidAmount(payment) {
  if (!payment) return 0
  if (typeof payment.paidAmount === "number") return payment.paidAmount
  if (payment.status === "paid") return payment.amount ?? 0
  return 0
}
