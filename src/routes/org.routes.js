import { Router } from "express"
import { protect } from "../middleware/protect.js"
import { isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { updateOrgSettingsSchema } from "../validators/schemas.js"
import * as ctrl from "../controllers/org.controller.js"

const router = Router()

router.use(...protect)

router.get("/banner", ctrl.getOrgBanner)
router.get("/leaderboard", ctrl.getOrgLeaderboard)
router.get("/settings", ctrl.getOrgSettings)
router.patch("/settings", isAdmin, validate(updateOrgSettingsSchema), ctrl.updateOrgSettings)
router.get("/billing", isAdmin, ctrl.getOrgBilling)

export default router
