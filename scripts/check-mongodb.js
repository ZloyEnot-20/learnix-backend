/**
 * MongoDB connectivity diagnostics (run on the VPS where the backend fails).
 * Usage: npm run db:check
 */
import dns from "node:dns/promises"
import net from "node:net"
import mongoose from "mongoose"
import { env } from "../src/config/env.js"

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

async function outboundIpv4() {
  try {
    const res = await fetch("https://ifconfig.me/ip", { signal: AbortSignal.timeout(8000) })
    return (await res.text()).trim()
  } catch {
    return null
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
  console.log("dbName:", env.dbName)
  console.log("URI (masked):", maskUri(env.mongoUri))

  const ip = await outboundIpv4()
  console.log("\nOutbound IPv4 (whitelist this in Atlas):", ip ?? "could not detect — run: curl -4 ifconfig.me")

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
      console.log("\n→ Still network/IP/DNS. Confirm Atlas shows IP:", ip ?? "?")
      console.log("  Temporarily add 0.0.0.0/0 in Atlas to isolate the cause.")
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
