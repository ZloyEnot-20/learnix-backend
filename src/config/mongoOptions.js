/** Shared MongoDB driver options (mongoose + mongodb native driver). */
export const MONGO_DRIVER_OPTS = {
  serverSelectionTimeoutMS: 10_000,
  /** Force IPv4 — VPS may otherwise connect via IPv6 not whitelisted in Atlas. */
  family: 4,
}

const ATLAS_GENERIC_RE =
  /could not connect to any servers in your mongodb atlas cluster/i

/** Walk err.cause, ServerSelectionError servers, etc. — Atlas often hides the real reason. */
export function collectMongoErrorMessages(err) {
  const messages = []
  const visited = new WeakSet()

  function visit(error) {
    if (!error || typeof error !== "object" || visited.has(error)) return
    visited.add(error)

    if (typeof error.message === "string" && error.message.trim()) {
      messages.push(error.message.trim())
    }
    if (error.codeName) messages.push(String(error.codeName))
    if (error.code != null) messages.push(`code ${error.code}`)

    if (error.cause) visit(error.cause)

    const servers = error.reason?.servers
    if (servers instanceof Map) {
      for (const desc of servers.values()) {
        if (desc?.error) visit(desc.error)
      }
    }

    if (Array.isArray(error.errors)) {
      for (const nested of error.errors) visit(nested)
    }
  }

  visit(err)
  return [...new Set(messages)]
}

/** @returns {'auth'|'network'|'dns'|'unknown'} */
export function classifyMongoConnectError(messages) {
  const text = messages.join(" ").toLowerCase()

  if (
    /\bbad auth\b/.test(text) ||
    /authentication failed/.test(text) ||
    /auth failed/.test(text) ||
    /invalid.*credentials/.test(text) ||
    /user not found/.test(text)
  ) {
    return "auth"
  }
  if (/enotfound|querysrv|dns/.test(text)) return "dns"
  if (
    /whitelist/.test(text) ||
    ATLAS_GENERIC_RE.test(text) ||
    /serverselection/.test(text) ||
    /timed out/.test(text) ||
    /econnrefused/.test(text) ||
    /econnreset/.test(text) ||
    /etimedout/.test(text)
  ) {
    return "network"
  }
  return "unknown"
}

/** Messages that are not the generic Atlas wrapper text. */
export function mongoRootCauses(messages) {
  return messages.filter((m) => !ATLAS_GENERIC_RE.test(m))
}

export function logMongoConnectSuccess(label, dbName) {
  console.log(`[db] ${label} connected (db: ${dbName})`)
}

/**
 * Verbose connect failure: full err, root cause(s), stack, and a specific hint.
 * @param {((kind: string) => Promise<void>) | null} networkHint — optional async Atlas IP hint
 */
export async function logMongoConnectError(label, err, networkHint = null) {
  const messages = collectMongoErrorMessages(err)
  const kind = classifyMongoConnectError(messages)
  const roots = mongoRootCauses(messages)

  console.error(`[db] ${label} connect failed [${kind}]:`)
  console.error(err)

  if (roots.length > 0) {
    console.error("[db] root cause(s):")
    for (const line of roots) console.error("  •", line)
  } else if (err?.message) {
    console.error("[db] message:", err.message)
  }

  if (err?.name) console.error("[db] error name:", err.name)
  if (err?.stack) console.error(err.stack)

  if (kind === "auth") {
    console.error(
      "[db] → Authentication failed: wrong user/password in MONGODB_URI (not IP whitelist).",
    )
    console.error("[db] → Use the same password as in Compass. Remove %40 unless @ is in the password.")
  } else if (kind === "dns") {
    console.error("[db] → DNS/SRV lookup failed on this host. Check resolver or use standard mongodb:// URI.")
  } else if (kind === "network" && networkHint) {
    await networkHint(kind)
  } else if (kind === "unknown") {
    console.error("[db] → Check MONGODB_URI in .env and Atlas Database Access / Network Access.")
  }
}
