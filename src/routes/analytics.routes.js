import { Router } from "express"
import * as ctrl from "../controllers/analytics.controller.js"
import { authenticate } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { recordEventSchema } from "../validators/schemas.js"

const router = Router()
router.use(authenticate)

router.post("/events", validate(recordEventSchema), ctrl.recordEvent)
router.get("/topics", ctrl.topicStats)

export default router
