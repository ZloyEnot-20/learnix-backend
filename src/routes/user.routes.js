import { Router } from "express"
import * as ctrl from "../controllers/user.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { createUserSchema, updateUserSchema, idParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(authenticate, isAdmin)

router.get("/", ctrl.listUsers)
router.post("/", validate(createUserSchema), ctrl.createUser)
router.get("/:id", validate(idParamSchema), ctrl.getUser)
router.patch("/:id", validate(updateUserSchema), ctrl.updateUser)
router.post("/:id/reset-password", validate(idParamSchema), ctrl.resetUserPassword)
router.delete("/:id", validate(idParamSchema), ctrl.deleteUser)

export default router
