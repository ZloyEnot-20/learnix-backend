import { authenticate } from "./auth.js"
import { requireActiveOrg } from "./requireActiveOrg.js"

/** Authenticated routes that must reject blocked organizations. */
export const protect = [authenticate, requireActiveOrg]
