import { Router } from "express"
import * as ctrl from "../controllers/botInvite.controller.js"
import { protect } from "../middleware/protect.js"
import { isStaff } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import { createInviteSchema, idParamSchema } from "../validators/schemas.js"

const router = Router()
router.use(...protect)

// All bot-management routes are staff-only.
router.get("/invites", isStaff, ctrl.listInvites)
router.post("/invites", isStaff, validate(createInviteSchema), ctrl.createInvite)
router.delete("/invites/:id", isStaff, validate(idParamSchema), ctrl.revokeInvite)

router.get("/subscribers", isStaff, ctrl.listSubscribers)
router.delete("/subscribers/:id", isStaff, validate(idParamSchema), ctrl.removeSubscriber)

// Student confirmation codes (login/password delivery via the bot).
router.get("/claims", isStaff, ctrl.listClaims)

export default router
