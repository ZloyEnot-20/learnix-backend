import { Router } from "express"
import * as ctrl from "../controllers/homework.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createHomeworkSchema,
  gradeSubmissionSchema,
  recordAttemptSchema,
  reportViolationSchema,
  startHomeworkSchema,
  recordHomeworkEntrySchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

// Student-facing
router.get("/check", isStaff, ctrl.homeworkCheck)
router.get("/mine", ctrl.myHomework)
router.post("/entry", validate(recordHomeworkEntrySchema), ctrl.recordHomeworkEntry)
router.post("/start", validate(startHomeworkSchema), ctrl.startHomework)
router.post("/pause", validate(startHomeworkSchema), ctrl.pauseHomework)
router.post("/violation", validate(reportViolationSchema), ctrl.reportViolation)
router.post("/attempt", validate(recordAttemptSchema), ctrl.recordAttempt)

// Staff
router.get("/", isStaff, ctrl.listHomework)
router.post("/", isStaff, validate(createHomeworkSchema), ctrl.createHomework)
router.get("/submissions", isStaff, ctrl.listSubmissions)
router.patch(
  "/submissions/:id",
  isStaff,
  validate(gradeSubmissionSchema),
  ctrl.gradeSubmission,
)
router.get("/:id/details", isStaff, validate(idParamSchema), ctrl.getHomeworkDetails)
router.get("/:id", validate(idParamSchema), ctrl.getHomework)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteHomework)

export default router
