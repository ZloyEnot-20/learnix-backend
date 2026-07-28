import { Router } from "express"
import * as ctrl from "../controllers/admin.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff, isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  adminBroadcastSchema,
  adminReadAllAlertsSchema,
  adminAlertReadSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.get("/dashboard", isStaff, ctrl.dashboard)
router.get("/teachers", isStaff, ctrl.teachers)
router.get("/homework-review", isStaff, ctrl.homeworkReviewQueue)

router.post("/notifications/broadcast", isAdmin, validate(adminBroadcastSchema), ctrl.broadcastNotification)
router.get("/notifications/history", isAdmin, ctrl.broadcastHistory)

router.get("/alerts", isAdmin, ctrl.alerts)
router.patch("/alerts/read", isAdmin, validate(adminAlertReadSchema), ctrl.readAlert)
router.post("/alerts/read-all", isAdmin, validate(adminReadAllAlertsSchema), ctrl.readAllAlerts)

export default router
