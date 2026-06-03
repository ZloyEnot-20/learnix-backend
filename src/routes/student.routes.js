import { Router } from "express"
import * as ctrl from "../controllers/student.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createStudentSchema,
  updateStudentSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(authenticate)

// Listing/creating students is staff-only.
router.get("/", isStaff, ctrl.listStudents)
router.post("/", isStaff, validate(createStudentSchema), ctrl.createStudent)

// A student can read their own record + progress (ownership checked in ctrl).
router.get("/:id", validate(idParamSchema), ctrl.getStudent)
router.get("/:id/progress", validate(idParamSchema), ctrl.getStudentProgress)
router.get("/:id/context", validate(idParamSchema), ctrl.getStudentContext)

router.patch("/:id", isStaff, validate(updateStudentSchema), ctrl.updateStudent)
router.delete("/:id", isStaff, validate(idParamSchema), ctrl.deleteStudent)

export default router
