import { Router } from "express"
import multer from "multer"
import { protect } from "../middleware/protect.js"
import { uploadSpeakingAudioHandler, uploadAvatarHandler } from "../controllers/upload.controller.js"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
})

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const router = Router()

router.use(...protect)
router.post("/speaking-audio", upload.single("audio"), uploadSpeakingAudioHandler)
router.post("/avatar", avatarUpload.single("photo"), uploadAvatarHandler)

export default router
