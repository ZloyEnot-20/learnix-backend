import { Router } from "express"
import { protect } from "../middleware/protect.js"
import { asyncHandler } from "../utils/asyncHandler.js"

const router = Router()
router.use(...protect)

router.post(
  "/push-token",
  asyncHandler(async (req, res) => {
    const { apnsToken, fcmToken } = req.body ?? {}
    console.log("[debug/push-token]", {
      userId: req.user?.id,
      userEmail: req.user?.email,
      apnsToken,
      fcmToken,
    })
    res.sendStatus(200)
  }),
)

export default router
