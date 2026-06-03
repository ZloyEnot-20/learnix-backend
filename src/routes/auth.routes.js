import { Router } from "express"
import * as auth from "../controllers/auth.controller.js"
import { authenticate } from "../middleware/auth.js"
import { validate } from "../middleware/validate.js"
import { authLimiter } from "../middleware/rateLimit.js"
import { registerSchema, loginSchema, refreshSchema } from "../validators/schemas.js"

const router = Router()

// Rate-limit every auth endpoint to mitigate brute force / abuse.
router.post("/register", authLimiter, validate(registerSchema), auth.register)
router.post("/login", authLimiter, validate(loginSchema), auth.login)
router.post("/refresh", authLimiter, validate(refreshSchema), auth.refresh)
router.get("/me", authenticate, auth.me)

export default router
