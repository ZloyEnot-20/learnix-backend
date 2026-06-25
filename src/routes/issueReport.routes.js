import { Router } from "express"
import * as ctrl from "../controllers/issueReport.controller.js"
import { protect } from "../middleware/protect.js"
import { validate } from "../middleware/validate.js"
import { createIssueReportSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.post("/", validate(createIssueReportSchema), ctrl.createIssueReport)

export default router
