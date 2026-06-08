import { Router } from "express"
import * as ctrl from "../controllers/audit.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isAdmin } from "../middleware/authorize.js"

const router = Router()
router.use(authenticate, isAdmin)

router.get("/", ctrl.listAuditLogs)
router.get("/meta", ctrl.getAuditCategories)

export default router
