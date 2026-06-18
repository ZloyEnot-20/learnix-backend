import { Router } from "express"
import * as ctrl from "../controllers/user.controller.js"
import { protect } from "../middleware/protect.js"
import { isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { createUserSchema, updateUserSchema, updateUserPermissionsSchema, idParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect, isAdmin)

router.get("/", ctrl.listUsers)
router.get("/permissions/catalog", ctrl.listPermissionCatalog)
router.post("/", validate(createUserSchema), ctrl.createUser)
router.get("/:id", validate(idParamSchema), ctrl.getUser)
router.patch("/:id", validate(updateUserSchema), ctrl.updateUser)
router.patch("/:id/permissions", validate(updateUserPermissionsSchema), ctrl.updateUserPermissions)
router.post("/:id/reset-password", validate(idParamSchema), ctrl.resetUserPassword)
router.delete("/:id", validate(idParamSchema), ctrl.deleteUser)

export default router
