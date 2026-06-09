import { Router } from "express"
import { protect } from "../middleware/protect.js"
import { isAdmin } from "../middleware/authorize.js"
import * as ctrl from "../controllers/org.controller.js"

const router = Router()

router.use(...protect)

router.get("/banner", ctrl.getOrgBanner)
router.get("/billing", isAdmin, ctrl.getOrgBilling)

export default router
