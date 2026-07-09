import { Router } from "express"
import * as ctrl from "../controllers/student.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createStudentSchema,
  updateStudentSchema,
  loginSuggestionsSchema,
  sendStudentNotificationSchema,
  pushTokenRegisterSchema,
  pushTokenUnregisterSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

// Listing/creating students is staff-only.
router.get("/login-suggestions", isStaff, validate(loginSuggestionsSchema), ctrl.loginSuggestions)
router.get("/ielts-summaries", isStaff, ctrl.getIeltsSummaries)
router.get("/language-profile-summaries", isStaff, ctrl.getLanguageProfileSummaries)
router.get("/language-profile/level-catalogue", isStaff, ctrl.getLanguageProfileLevelCatalogue)
router.get("/", isStaff, ctrl.listStudents)
router.post("/", isStaff, validate(createStudentSchema), ctrl.createStudent)

// A student can read their own record + progress (ownership checked in ctrl).
router.get("/:id", validate(idParamSchema), ctrl.getStudent)
router.get("/:id/progress", validate(idParamSchema), ctrl.getStudentProgress)
router.get("/:id/ielts-profile", validate(idParamSchema), ctrl.getIeltsProfile)
router.get("/:id/language-profile/history", validate(idParamSchema), ctrl.getLanguageProfileHistory)
router.get("/:id/recommended-homework", validate(idParamSchema), ctrl.getRecommendedHomework)
router.get("/:id/language-profile", validate(idParamSchema), ctrl.getLanguageProfile)
router.post("/:id/language-profile/recompute", isStaff, validate(idParamSchema), ctrl.recomputeLanguageProfile)
router.get("/:id/level", validate(idParamSchema), ctrl.getStudentLevel)
router.get("/:id/context", validate(idParamSchema), ctrl.getStudentContext)

router.patch("/:id", isStaff, validate(updateStudentSchema), ctrl.updateStudent)
router.post(
  "/:id/notify",
  isStaff,
  validate(sendStudentNotificationSchema),
  ctrl.sendStudentNotification,
)
router.post("/:id/claim", isStaff, validate(idParamSchema), ctrl.regenerateClaim)
router.post("/:id/delete-account", validate(idParamSchema), ctrl.deleteMyAccount)
router.post("/:id/push-token", validate(pushTokenRegisterSchema), ctrl.registerPushToken)
router.delete("/:id/push-token", validate(pushTokenUnregisterSchema), ctrl.unregisterPushToken)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteStudent)

export default router
