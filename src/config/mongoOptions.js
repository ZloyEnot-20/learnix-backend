/** Shared MongoDB driver options (mongoose + mongodb native driver). */
export const MONGO_DRIVER_OPTS = {
  serverSelectionTimeoutMS: 10_000,
  /** Force IPv4 — VPS may otherwise connect via IPv6 not whitelisted in Atlas. */
  family: 4,
}
