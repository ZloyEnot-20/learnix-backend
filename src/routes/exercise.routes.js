import { Router } from "express"
import * as ctrl from "../controllers/exercise.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isSuperAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  importCatalogSchema,
  importVocabSchema,
  slugParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(authenticate)

// Read paths — available to any authenticated user (students included).
router.get("/", ctrl.listExercises)
router.get("/topics", ctrl.listTopics)
router.get("/levels", ctrl.listLevels)
router.get("/vocab", ctrl.listVocabDecks)
router.get("/vocab/:slug", validate(slugParamSchema), ctrl.getVocabDeck)

// Super-admin bulk import of the local catalogue into the database.
router.post("/import", isSuperAdmin, validate(importCatalogSchema), ctrl.importCatalog)
router.post("/vocab/import", isSuperAdmin, validate(importVocabSchema), ctrl.importVocabDecks)

router.get("/:slug", validate(slugParamSchema), ctrl.getExercise)

export default router
