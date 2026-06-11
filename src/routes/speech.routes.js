import { Router } from "express"
import * as ctrl from "../controllers/speech.controller.js"
import { protect } from "../middleware/protect.js"
import { isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { speechTestSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.get("/status", isAdmin, ctrl.getSpeechStatus)
router.post("/test", isAdmin, validate(speechTestSchema), ctrl.testSpeechTranscription)

export default router
