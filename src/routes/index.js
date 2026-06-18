import { Router } from "express"
import authRoutes from "./auth.routes.js"
import groupRoutes from "./group.routes.js"
import studentRoutes from "./student.routes.js"
import homeworkRoutes from "./homework.routes.js"
import entryTestRoutes from "./entryTest.routes.js"
import paymentRoutes from "./payment.routes.js"
import analyticsRoutes from "./analytics.routes.js"
import testResultRoutes from "./testResult.routes.js"
import notificationRoutes from "./notification.routes.js"
import exerciseRoutes from "./exercise.routes.js"
import controlWorkRoutes from "./controlWork.routes.js"
import botInviteRoutes from "./botInvite.routes.js"
import userRoutes from "./user.routes.js"
import auditRoutes from "./audit.routes.js"
import orgRoutes from "./org.routes.js"
import uploadRoutes from "./upload.routes.js"
import speechRoutes from "./speech.routes.js"
import lessonRoutes from "./lesson.routes.js"

const router = Router()

router.use("/auth", authRoutes)
router.use("/groups", groupRoutes)
router.use("/students", studentRoutes)
router.use("/homework", homeworkRoutes)
router.use("/control-works", controlWorkRoutes)
router.use("/entry-tests", entryTestRoutes)
router.use("/payments", paymentRoutes)
router.use("/analytics", analyticsRoutes)
router.use("/test-results", testResultRoutes)
router.use("/notifications", notificationRoutes)
router.use("/exercises", exerciseRoutes)
router.use("/bot", botInviteRoutes)
router.use("/users", userRoutes)
router.use("/audit", auditRoutes)
router.use("/org", orgRoutes)
router.use("/uploads", uploadRoutes)
router.use("/speech", speechRoutes)
router.use("/lessons", lessonRoutes)

export default router
