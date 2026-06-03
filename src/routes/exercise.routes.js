import { Router } from "express"
import * as ctrl from "../controllers/exercise.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { importCatalogSchema, slugParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(authenticate)

// Read paths — available to any authenticated user (students included).
router.get("/", ctrl.listExercises)
router.get("/topics", ctrl.listTopics)

// Staff-only bulk import of the local catalogue into the database.
router.post("/import", isStaff, validate(importCatalogSchema), ctrl.importCatalog)

router.get("/:slug", validate(slugParamSchema), ctrl.getExercise)

export default router
