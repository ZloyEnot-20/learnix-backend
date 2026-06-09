import { Router } from "express"
import * as ctrl from "../controllers/entryTest.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  assignEntrySchema,
  saveMcSchema,
  saveReadingSchema,
  writingDraftSchema,
  submitWritingSchema,
  gradeWritingSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

// Student-facing
router.get("/mine", ctrl.myEntryTest)
router.patch("/:id/mc", validate(saveMcSchema), ctrl.saveMc)
router.patch("/:id/reading", validate(saveReadingSchema), ctrl.saveReading)
router.patch("/:id/writing/draft", validate(writingDraftSchema), ctrl.saveWritingDraft)
router.patch("/:id/writing/submit", validate(submitWritingSchema), ctrl.submitWriting)

// Staff
router.get("/", isStaff, ctrl.listEntryTests)
router.post("/", isStaff, validate(assignEntrySchema), ctrl.assignEntryTest)
router.patch("/:id/grade", isStaff, validate(gradeWritingSchema), ctrl.gradeWriting)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteEntryTest)

// Read single (owner or staff; access checked in controller)
router.get("/:id", validate(idParamSchema), ctrl.getEntryTest)

export default router
