import { Router } from "express"
import * as ctrl from "../controllers/controlWork.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  completeControlWorkStepSchema,
  createControlWorkSchema,
  idParamSchema,
  reportControlWorkViolationSchema,
  startControlWorkSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

router.get("/mine", ctrl.myControlWorks)
router.post("/start", validate(startControlWorkSchema), ctrl.startControlWork)
router.post("/pause", validate(startControlWorkSchema), ctrl.pauseControlWork)
router.post(
  "/violation",
  validate(reportControlWorkViolationSchema),
  ctrl.reportControlWorkViolation,
)
router.post(
  "/step",
  validate(completeControlWorkStepSchema),
  ctrl.completeControlWorkStep,
)

router.get("/", isStaff, ctrl.listControlWorks)
router.post("/", isStaff, validate(createControlWorkSchema), ctrl.createControlWork)
router.get("/submissions", isStaff, ctrl.listControlWorkSubmissions)
router.get("/:id", validate(idParamSchema), ctrl.getControlWork)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteControlWork)

export default router
