import { Router } from "express"
import * as ctrl from "../controllers/analytics.controller.js"
import { protect } from "../middleware/protect.js"
import { validate } from "../middleware/validate.js"
import { recordEventSchema, recordVocabSchema, recordVocabWordSchema, syncLearnSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.post("/events", validate(recordEventSchema), ctrl.recordEvent)
router.post("/vocab", validate(recordVocabSchema), ctrl.recordVocab)
router.post("/vocab/word", validate(recordVocabWordSchema), ctrl.recordVocabWord)
router.post("/learn/sync", validate(syncLearnSchema), ctrl.syncLearn)
router.get("/learn/progress", ctrl.learnProgress)
router.get("/learn/progress/:studentId", ctrl.learnProgress)
router.get("/vocab/words/stats", ctrl.vocabWordStats)
router.get("/vocab/decks/stats", ctrl.vocabDeckStats)
router.get("/topics", ctrl.topicStats)
router.get("/exercises", ctrl.exerciseStats)
router.get("/activity", ctrl.listActivity)
router.get("/students/:studentId/summary", ctrl.studentSummary)
router.get("/summary", ctrl.studentSummary)

export default router
