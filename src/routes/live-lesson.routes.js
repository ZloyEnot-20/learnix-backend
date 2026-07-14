import { Router } from "express"
import * as ctrl from "../controllers/live-lesson.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  assignLiveLessonUnitSchema,
  createLiveLessonSchema,
  getLiveLessonBookSchema,
  getLiveLessonBookUnitSchema,
  liveLessonIdSchema,
  openLiveLessonSchema,
  selectLiveLessonExerciseSchema,
  studentLiveLessonHeartbeatSchema,
  studentLiveLessonProgressSchema,
} from "../validators/live-lesson.schemas.js"

const router = Router()
router.use(...protect)

// Platform curriculum books — any authenticated user (all tenants)
router.get("/books", ctrl.listBooks)
router.get("/books/:bookId", validate(getLiveLessonBookSchema), ctrl.getBook)
router.get(
  "/books/:bookId/units/:unitNumber",
  validate(getLiveLessonBookUnitSchema),
  ctrl.getBookUnit,
)

// Teacher session control
router.get("/", isStaff, ctrl.listLiveLessons)
router.post("/", isStaff, validate(createLiveLessonSchema), ctrl.createLiveLesson)

// Student: active lesson for their group (must be before /:id)
router.get("/active", ctrl.getActiveForMe)
router.post("/active/join", ctrl.joinActiveForMe)

router.get("/:id", isStaff, validate(liveLessonIdSchema), ctrl.getLiveLesson)
router.post("/:id/start", isStaff, validate(liveLessonIdSchema), ctrl.startLiveLesson)
router.post("/:id/pause", isStaff, validate(liveLessonIdSchema), ctrl.pauseLiveLesson)
router.post("/:id/resume", isStaff, validate(liveLessonIdSchema), ctrl.resumeLiveLesson)
router.post("/:id/finish", isStaff, validate(liveLessonIdSchema), ctrl.finishLiveLesson)
router.post("/:id/assign-unit", isStaff, validate(assignLiveLessonUnitSchema), ctrl.assignUnit)
router.post("/:id/complete-unit", isStaff, validate(liveLessonIdSchema), ctrl.completeUnit)
router.post("/:id/exercise", isStaff, validate(selectLiveLessonExerciseSchema), ctrl.selectExercise)
router.post("/:id/open", isStaff, validate(openLiveLessonSchema), ctrl.setOpenForStudents)

router.post("/:id/join", validate(liveLessonIdSchema), ctrl.joinLiveLesson)
router.post("/:id/progress", validate(studentLiveLessonProgressSchema), ctrl.studentProgress)
router.post("/:id/heartbeat", validate(studentLiveLessonHeartbeatSchema), ctrl.studentHeartbeat)

export default router
