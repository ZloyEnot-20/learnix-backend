import { Router } from "express"
import * as ctrl from "../controllers/live-lesson.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createLiveLessonSchema,
  getLiveLessonBookSchema,
  getLiveLessonBookUnitSchema,
  joinLiveLessonByCodeSchema,
  liveLessonIdSchema,
  openLiveLessonSchema,
  selectLiveLessonExerciseSchema,
  studentLiveLessonHeartbeatSchema,
  studentLiveLessonProgressSchema,
} from "../validators/live-lesson.schemas.js"

const router = Router()
router.use(...protect)

// ----- Teacher (staff) -----
router.get("/books", isStaff, ctrl.listBooks)
router.get("/books/:bookId", isStaff, validate(getLiveLessonBookSchema), ctrl.getBook)
router.get(
  "/books/:bookId/units/:unitNumber",
  isStaff,
  validate(getLiveLessonBookUnitSchema),
  ctrl.getBookUnit,
)

router.post("/", isStaff, validate(createLiveLessonSchema), ctrl.createLiveLesson)

// ----- Student -----
router.get("/join/:code", validate(joinLiveLessonByCodeSchema), ctrl.joinByCode)

// ----- Shared by id (staff mutations / student presence) -----
router.get("/:id", isStaff, validate(liveLessonIdSchema), ctrl.getLiveLesson)
router.post("/:id/start", isStaff, validate(liveLessonIdSchema), ctrl.startLiveLesson)
router.post("/:id/pause", isStaff, validate(liveLessonIdSchema), ctrl.pauseLiveLesson)
router.post("/:id/resume", isStaff, validate(liveLessonIdSchema), ctrl.resumeLiveLesson)
router.post("/:id/finish", isStaff, validate(liveLessonIdSchema), ctrl.finishLiveLesson)
router.post("/:id/exercise", isStaff, validate(selectLiveLessonExerciseSchema), ctrl.selectExercise)
router.post("/:id/open", isStaff, validate(openLiveLessonSchema), ctrl.setOpenForStudents)

router.post("/:id/join", validate(liveLessonIdSchema), ctrl.joinLiveLesson)
router.post("/:id/progress", validate(studentLiveLessonProgressSchema), ctrl.studentProgress)
router.post("/:id/heartbeat", validate(studentLiveLessonHeartbeatSchema), ctrl.studentHeartbeat)

export default router
