import { Router } from "express"
import * as ctrl from "../controllers/student.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createStudentSchema,
  updateStudentSchema,
  loginSuggestionsSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect)

// Listing/creating students is staff-only.
router.get("/login-suggestions", isStaff, validate(loginSuggestionsSchema), ctrl.loginSuggestions)
router.get("/", isStaff, ctrl.listStudents)
router.post("/", isStaff, validate(createStudentSchema), ctrl.createStudent)

// A student can read their own record + progress (ownership checked in ctrl).
router.get("/:id", validate(idParamSchema), ctrl.getStudent)
router.get("/:id/progress", validate(idParamSchema), ctrl.getStudentProgress)
router.get("/:id/level", validate(idParamSchema), ctrl.getStudentLevel)
router.get("/:id/context", validate(idParamSchema), ctrl.getStudentContext)

router.patch("/:id", isStaff, validate(updateStudentSchema), ctrl.updateStudent)
router.post("/:id/claim", isStaff, validate(idParamSchema), ctrl.regenerateClaim)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteStudent)

export default router
