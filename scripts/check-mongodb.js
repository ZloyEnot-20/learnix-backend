/**
 * MongoDB connectivity diagnostics (run on the VPS where the backend fails).
 * Usage: npm run db:check
 */
import dns from "node:dns/promises"
import net from "node:net"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"
import { detectOutboundIps, formatAtlasWhitelistHint } from "../src/config/outboundIp.js"

function maskUri(uri) {
  try {
    const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://"))
    return {
      scheme: uri.startsWith("mongodb+srv") ? "mongodb+srv" : "mongodb",
      user: u.username || "(none)",
      host: u.hostname,
      db: u.pathname.replace(/^\//, "") || "(default via dbName)",
      hasPassword: Boolean(u.password),
    }
  } catch {
    return { error: "URI parse failed — check quotes/special chars in .env" }
  }
}

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
  console.log("=== MongoDB diagnostics ===\n")
  console.log("NODE_ENV:", env.nodeEnv)
  console.log("mongoose:", (await import("mongoose")).default.version)
  console.log("dbName:", env.dbName)
  console.log("URI (masked):", maskUri(env.mongoUri))

  const ips = await detectOutboundIps()
  console.log("\nOutbound IPs (whitelist ALL in Atlas → Network Access):")
  console.log(formatAtlasWhitelistHint(ips))
  if (ips.ipv6) {
    console.log("  ⚠ VPS uses IPv6 — adding only 0.0.0.0/0 will NOT help; add IPv6 or ::/0")
  }

  const host = maskUri(env.mongoUri).host
  if (host && !maskUri(env.mongoUri).error) {
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
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15_000, dbName: env.dbName })
    await mongoose.connection.db.admin().ping()
    console.log("CONNECT: OK (db:", mongoose.connection.name + ")")
  } catch (err) {
    const msg = String(err?.message ?? err)
    console.log("CONNECT: FAIL")
    console.log("  ", msg.split("\n")[0])
    if (/authentication|auth failed|bad auth/i.test(msg)) {
      console.log("\n→ Wrong password/user in MONGODB_URI on this server (not IP whitelist).")
    } else if (/whitelist|Could not connect to any servers/i.test(msg)) {
      console.log("\n→ Network/IP whitelist. Add to Atlas:\n  " + formatAtlasWhitelistHint(ips).replace(/\n/g, "\n  "))
      console.log("  Quick test: add 0.0.0.0/0 AND ::/0 temporarily, then restrict to specific IPs.")
    } else if (/ENOTFOUND|querySrv/i.test(msg)) {
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
