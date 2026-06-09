import { Router } from "express"
import * as ctrl from "../controllers/testResult.controller.js"
import { protect } from "../middleware/protect.js"
import { validate } from "../middleware/validate.js"
import { saveTestResultSchema, idParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.get("/", ctrl.listTestResults)
router.post("/", validate(saveTestResultSchema), ctrl.saveTestResult)
router.get("/:id", validate(idParamSchema), ctrl.getTestResult)

export default router
