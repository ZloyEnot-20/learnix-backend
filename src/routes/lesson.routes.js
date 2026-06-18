import { Router } from "express"
import * as ctrl from "../controllers/lesson.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createLessonSchema,
  updateLessonSchema,
  idParamSchema,
  listLessonsSchema,
  deleteLessonSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(...protect, isStaff)

router.get("/", validate(listLessonsSchema), ctrl.listLessons)
router.post("/", validate(createLessonSchema), ctrl.createLesson)
router.get("/:id", validate(idParamSchema), ctrl.getLesson)
router.patch("/:id", validate(updateLessonSchema), ctrl.updateLesson)
router.delete("/:id", validate(deleteLessonSchema), ctrl.deleteLesson)

export default router
