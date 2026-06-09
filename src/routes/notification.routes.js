import { Router } from "express"
import * as ctrl from "../controllers/notification.controller.js"
import { protect } from "../middleware/protect.js"
import { validate } from "../middleware/validate.js"
import { idParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.get("/", ctrl.listMyNotifications)
router.post("/read-all", ctrl.markAllRead)
router.patch("/:id/read", validate(idParamSchema), ctrl.markRead)

export default router
