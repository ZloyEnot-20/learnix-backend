import { Router } from "express"
import * as ctrl from "../controllers/analytics.controller.js"
import { protect } from "../middleware/protect.js"
import { validate } from "../middleware/validate.js"
import { recordEventSchema, recordVocabSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.post("/events", validate(recordEventSchema), ctrl.recordEvent)
router.post("/vocab", validate(recordVocabSchema), ctrl.recordVocab)
router.get("/topics", ctrl.topicStats)
router.get("/activity", ctrl.listActivity)
router.get("/students/:studentId/summary", ctrl.studentSummary)
router.get("/summary", ctrl.studentSummary)

export default router
