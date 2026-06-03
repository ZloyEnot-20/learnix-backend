import { Router } from "express"
import * as ctrl from "../controllers/payment.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createPaymentSchema,
  updatePaymentSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(authenticate, isStaff)

router.get("/", ctrl.listPayments)
router.post("/", validate(createPaymentSchema), ctrl.createPayment)
router.get("/group/:id/summary", validate(idParamSchema), ctrl.groupFinanceSummary)
router.patch("/:id", validate(updatePaymentSchema), ctrl.updatePayment)
router.delete("/:id", validate(idParamSchema), ctrl.deletePayment)
router.post("/:id/paid", validate(idParamSchema), ctrl.markPaid)
router.post("/:id/unpaid", validate(idParamSchema), ctrl.markUnpaid)

export default router
