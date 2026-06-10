import { Router } from "express"
import multer from "multer"
import { protect } from "../middleware/protect.js"
import { uploadSpeakingAudioHandler } from "../controllers/upload.controller.js"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

const router = Router()

router.use(...protect)
router.post("/speaking-audio", upload.single("audio"), uploadSpeakingAudioHandler)

export default router
