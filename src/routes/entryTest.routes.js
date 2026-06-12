import { Router } from "express"
import * as ctrl from "../controllers/entryTest.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { entryTestPublicLimiter } from "../middleware/rateLimit.js"
import { validate } from "../middleware/validate.js"
import {
  assignEntrySchema,
  assignPhoneEntrySchema,
  phoneLookupSchema,
  publicSaveMcSchema,
  publicSaveReadingSchema,
  publicWritingDraftSchema,
  publicSubmitWritingSchema,
  saveMcSchema,
  saveReadingSchema,
  writingDraftSchema,
  submitWritingSchema,
  gradeWritingSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()

// Public — phone-based entry test (no login)
router.use("/public", entryTestPublicLimiter)
router.post("/public/lookup", validate(phoneLookupSchema), ctrl.lookupByPhone)
router.patch("/public/:id/mc", validate(publicSaveMcSchema), ctrl.publicSaveMc)
router.patch("/public/:id/reading", validate(publicSaveReadingSchema), ctrl.publicSaveReading)
router.patch(
  "/public/:id/writing/draft",
  validate(publicWritingDraftSchema),
  ctrl.publicSaveWritingDraft,
)
router.patch(
  "/public/:id/writing/submit",
  validate(publicSubmitWritingSchema),
  ctrl.publicSubmitWriting,
)

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
router.post("/register", isStaff, validate(assignPhoneEntrySchema), ctrl.registerEntryTestCandidateHandler)
router.patch("/:id/grade", isStaff, validate(gradeWritingSchema), ctrl.gradeWriting)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteEntryTest)

// Read single (owner or staff; access checked in controller)
router.get("/:id", validate(idParamSchema), ctrl.getEntryTest)

export default router
