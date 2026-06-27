/**
 * MongoDB connectivity diagnostics (run on the VPS where the backend fails).
 * Usage: npm run db:check
 */
import dns from "node:dns/promises"
import { setServers } from "node:dns"
import net from "node:net"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import {
  MONGO_DRIVER_OPTS,
  buildMongoConnectOptions,
  classifyMongoConnectError,
  collectMongoErrorMessages,
  logMongoConnectDebug,
  maskMongoUri,
  mongoRootCauses,
} from "../src/config/mongoOptions.js"
import { detectOutboundIps, formatAtlasWhitelistHint } from "../src/config/outboundIp.js"

async function resolveSrv(host) {
  try {
    return await dns.resolveSrv(`_mongodb._tcp.${host}`)
  } catch (err) {
    return { error: err.message }
  }
}

function tcpProbe(host, port, ms = 5000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: ms })
    socket.on("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.on("error", (err) => resolve(err.message))
    socket.on("timeout", () => {
      socket.destroy()
      resolve("timeout")
    })
  })
}

async function main() {
  // Windows/local DNS often refuses SRV lookups that mongodb+srv requires.
  setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"])

  console.log("=== MongoDB diagnostics ===\n")
  console.log("NODE_ENV:", env.nodeEnv)
  console.log("mongoose:", (await import("mongoose")).default.version)
  console.log("dbName:", env.dbName)
  console.log("platformDbName:", env.platformDbName)
  logMongoConnectDebug("check-mongodb", {
    mongoUri: env.mongoUri,
    dbName: env.dbName,
    platformDbName: env.platformDbName,
  })

  const ips = await detectOutboundIps()
  console.log("\nOutbound IPs (whitelist ALL in Atlas → Network Access):")
  console.log(formatAtlasWhitelistHint(ips))
  if (ips.ipv6) {
    console.log("  ⚠ VPS uses IPv6 — adding only 0.0.0.0/0 will NOT help; add IPv6 or ::/0")
  }

  const masked = maskMongoUri(env.mongoUri)
  const host = masked.host
  if (host && !masked.error) {
    if (env.mongoUri.startsWith("mongodb+srv")) {
      console.log("\nSRV lookup _mongodb._tcp." + host)
      const srv = await resolveSrv(host)
      if (Array.isArray(srv) && srv.length) {
        console.log("  OK:", srv.length, "host(s)", srv.map((r) => `${r.name}:${r.port}`).join(", "))
        const first = srv[0]
        const tcp = await tcpProbe(first.name, first.port)
        console.log(`  TCP ${first.name}:${first.port} →`, tcp === true ? "OK" : tcp)
      } else {
        console.log("  FAIL:", srv.error ?? "no records")
        console.log("  → VPS DNS may block SRV; try standard mongodb:// URI from Atlas")
      }
    } else {
      const hosts = env.mongoUri.split("@")[1]?.split("/")[0]?.split(",") ?? []
      for (const h of hosts.slice(0, 3)) {
        const [name, port = "27017"] = h.split(":")
        const tcp = await tcpProbe(name, Number(port))
        console.log(`TCP ${name}:${port} →`, tcp === true ? "OK" : tcp)
      }
    }
  }

  console.log("\nMongoose connect test…")
  mongoose.set("strictQuery", true)
  try {
    await mongoose.connect(env.mongoUri, {
      ...buildMongoConnectOptions(env.dbName),
      serverSelectionTimeoutMS: 15_000,
    })
    await mongoose.connection.db.admin().ping()
    console.log("CONNECT: OK (db:", mongoose.connection.name + ")")
  } catch (err) {
    const messages = collectMongoErrorMessages(err)
    const kind = classifyMongoConnectError(messages)
    const roots = mongoRootCauses(messages)

    console.log("CONNECT: FAIL [" + kind + "]")
    if (roots.length) {
      console.log("  root cause(s):")
      for (const line of roots) console.log("    •", line)
    } else {
      console.log("  ", String(err?.message ?? err).split("\n")[0])
    }

    if (kind === "auth") {
      console.log("\n→ Wrong password/user in MONGODB_URI (same as Compass, no extra %40).")
    } else if (kind === "network") {
      console.log("\n→ Network/IP whitelist. Add to Atlas:\n  " + formatAtlasWhitelistHint(ips).replace(/\n/g, "\n  "))
      console.log("  Quick test: add 0.0.0.0/0 AND ::/0 temporarily, then restrict to specific IPs.")
    } else if (kind === "dns") {
      console.log("\n→ DNS problem on VPS (cannot resolve MongoDB SRV/hostnames).")
    }
  } finally {
    await mongoose.disconnect().catch(() => {})
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
