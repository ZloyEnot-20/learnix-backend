import { Router } from "express"
import authRoutes from "./auth.routes.js"
import groupRoutes from "./group.routes.js"
import studentRoutes from "./student.routes.js"
import homeworkRoutes from "./homework.routes.js"
import entryTestRoutes from "./entryTest.routes.js"
import paymentRoutes from "./payment.routes.js"
import analyticsRoutes from "./analytics.routes.js"
import testResultRoutes from "./testResult.routes.js"

const router = Router()

router.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }))

router.use("/auth", authRoutes)
router.use("/groups", groupRoutes)
router.use("/students", studentRoutes)
router.use("/homework", homeworkRoutes)
router.use("/entry-tests", entryTestRoutes)
router.use("/payments", paymentRoutes)
router.use("/analytics", analyticsRoutes)
router.use("/test-results", testResultRoutes)

export default router
