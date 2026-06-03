import { Router } from "express"
import * as ctrl from "../controllers/group.controller.js"
import { authenticate } from "../middleware/auth.js"
import { isStaff, authorize } from "../middleware/authorize.js"
import { validate } from "../middleware/validate.js"
import {
  createGroupSchema,
  updateGroupSchema,
  groupMemberSchema,
  idParamSchema,
} from "../validators/schemas.js"

const router = Router()
router.use(authenticate, isStaff)

router.get("/", ctrl.listGroups)
router.post("/", validate(createGroupSchema), ctrl.createGroup)
router.get("/:id", validate(idParamSchema), ctrl.getGroup)
router.patch("/:id", validate(updateGroupSchema), ctrl.updateGroup)
router.delete("/:id", authorize("admin"), validate(idParamSchema), ctrl.deleteGroup)
router.post("/:id/members", validate(groupMemberSchema), ctrl.addMember)
router.delete("/:id/members", validate(groupMemberSchema), ctrl.removeMember)

export default router
