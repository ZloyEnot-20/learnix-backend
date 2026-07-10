import { Router } from "express"
import multer from "multer"
import * as ctrl from "../controllers/exercise.controller.js"
import * as podcastCtrl from "../controllers/podcast.controller.js"
import * as readingCtrl from "../controllers/ieltsReading.controller.js"
import * as listeningCtrl from "../controllers/ieltsListening.controller.js"
import { protect } from "../middleware/protect.js"
import { isAdmin, isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  importCatalogSchema,
  importVocabSchema,
  manageOrgVocabSchema,
  manageOrgSpeakingSchema,
  importPodcastSchema,
  importReadingSchema,
  importListeningSchema,
  slugParamSchema,
  exerciseMetaBatchSchema,
} from "../validators/schemas.js"

const podcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
})

const router = Router()

router.use(...protect)

// Read paths — available to any authenticated user (students included).
router.get("/summary", ctrl.listExerciseSummaries)
router.get("/", ctrl.listExercises)
router.get("/topics", ctrl.listTopics)
router.get("/levels", ctrl.listLevels)
router.get("/vocab/summary", ctrl.listVocabDeckSummaries)
router.get("/vocab/org", isStaff, ctrl.listOrgVocabDecks)
router.get("/speaking/org", isStaff, ctrl.listOrgSpeakingSets)
router.get("/vocab", ctrl.listVocabDecks)
router.get("/vocab/:slug", validate(slugParamSchema), ctrl.getVocabDeck)
router.get("/podcasts/summary", podcastCtrl.listPodcastSummaries)
router.get("/podcasts", podcastCtrl.listPodcasts)
router.get("/podcasts/:slug", validate(slugParamSchema), podcastCtrl.getPodcast)
router.get("/reading/summary", readingCtrl.listReadingSummaries)
router.get("/reading", readingCtrl.listReadings)
router.get("/reading/:slug", validate(slugParamSchema), readingCtrl.getReading)
router.get("/listening/summary", listeningCtrl.listListeningSummaries)
router.get("/listening", listeningCtrl.listListenings)
router.get("/listening/:slug", validate(slugParamSchema), listeningCtrl.getListening)
router.post("/meta", validate(exerciseMetaBatchSchema), ctrl.getExerciseMetaBatch)

// Org admin + super admin bulk import into the shared catalogue.
router.post("/import", isAdmin, validate(importCatalogSchema), ctrl.importCatalog)
router.post("/vocab/import", isAdmin, validate(importVocabSchema), ctrl.importVocabDecks)
router.post("/vocab/manage", isStaff, validate(manageOrgVocabSchema), ctrl.manageOrgVocab)
router.post("/speaking/manage", isStaff, validate(manageOrgSpeakingSchema), ctrl.manageOrgSpeaking)
router.post(
  "/podcasts/upload",
  isAdmin,
  podcastUpload.single("audio"),
  podcastCtrl.uploadPodcast,
)
router.post("/podcasts/import", isAdmin, validate(importPodcastSchema), podcastCtrl.importPodcasts)
router.post("/reading/import", isAdmin, validate(importReadingSchema), readingCtrl.importReadings)
router.post(
  "/listening/import",
  isAdmin,
  validate(importListeningSchema),
  listeningCtrl.importListenings,
)

router.get("/:slug", validate(slugParamSchema), ctrl.getExercise)

export default router
