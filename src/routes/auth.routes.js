import { Router } from "express"
import * as auth from "../controllers/auth.controller.js"
import { authenticate } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { authLimiter } from "../middleware/rateLimit.js"
import { registerSchema, loginSchema, refreshSchema } from "../validators/schemas.js"

const router = Router()

const postOnly = (path) => (_req, res) => {
  res.status(405).json({
    error: "Method not allowed",
    path,
    hint: "This endpoint accepts POST only (JSON body). Opening it in the browser sends GET.",
  })
}

// Rate-limit every auth endpoint to mitigate brute force / abuse.
router.get("/login", postOnly("/auth/login"))
router.post("/login", authLimiter, validate(loginSchema), auth.login)
router.get("/register", postOnly("/auth/register"))
router.post("/register", authLimiter, validate(registerSchema), auth.register)
router.get("/refresh", postOnly("/auth/refresh"))
router.post("/refresh", authLimiter, validate(refreshSchema), auth.refresh)
router.get("/me", authenticate, auth.me)

export default router
