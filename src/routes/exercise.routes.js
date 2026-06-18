import { Router } from "express"
import multer from "multer"
import * as ctrl from "../controllers/exercise.controller.js"
import * as podcastCtrl from "../controllers/podcast.controller.js"
import { protect } from "../middleware/protect.js"
import { isAdmin } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  importCatalogSchema,
  importVocabSchema,
  importPodcastSchema,
  slugParamSchema,
} from "../validators/schemas.js"

const podcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
})

const router = Router()

router.use(...protect)

// Read paths — available to any authenticated user (students included).
router.get("/", ctrl.listExercises)
router.get("/topics", ctrl.listTopics)
router.get("/levels", ctrl.listLevels)
router.get("/vocab", ctrl.listVocabDecks)
router.get("/vocab/:slug", validate(slugParamSchema), ctrl.getVocabDeck)
router.get("/podcasts", podcastCtrl.listPodcasts)
router.get("/podcasts/:slug", validate(slugParamSchema), podcastCtrl.getPodcast)

// Org admin + super admin bulk import into the shared catalogue.
router.post("/import", isAdmin, validate(importCatalogSchema), ctrl.importCatalog)
router.post("/vocab/import", isAdmin, validate(importVocabSchema), ctrl.importVocabDecks)
router.post(
  "/podcasts/upload",
  isAdmin,
  podcastUpload.single("audio"),
  podcastCtrl.uploadPodcast,
)
router.post("/podcasts/import", isAdmin, validate(importPodcastSchema), podcastCtrl.importPodcasts)

router.get("/:slug", validate(slugParamSchema), ctrl.getExercise)

export default router
