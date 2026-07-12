import { Server } from "socket.io"
import { env } from "../config/env.js"
import { resolveCorsOptions } from "../utils/cors.js"
import { verifyAccessToken } from "../utils/jwt.js"
import { User } from "../models/User.js"
import { isStaffType } from "../constants/userTypes.js"
import * as liveLessonService from "../services/live-lesson.service.js"

/** @type {import("socket.io").Server | null} */
let io = null

function roomForSession(sessionId) {
  return `live:${sessionId}`
}

function roomForUser(userId) {
  return `user:${userId}`
}

export function emitLessonState(sessionId, state) {
  if (!io) return
  const payload = state ?? null
  if (!payload) return
  io.to(roomForSession(sessionId)).emit("lesson:state", payload)
}

export function emitLessonPresence(sessionId, patch) {
  if (!io || !patch) return
  io.to(roomForSession(sessionId)).emit("lesson:presence", patch)
}

async function broadcastSession(session) {
  const state = liveLessonService.serialize(session)
  emitLessonState(session._id, state)
  return state
}

function requireStaff(socket) {
  if (!socket.user || !isStaffType(socket.user.type)) {
    const err = new Error("Forbidden")
    err.data = { code: "FORBIDDEN" }
    throw err
  }
}

function requireStudent(socket) {
  if (!socket.user || socket.user.type !== "student") {
    const err = new Error("Forbidden")
    err.data = { code: "FORBIDDEN" }
    throw err
  }
}

async function assertStaffSessionAccess(socket, session) {
  requireStaff(socket)
  if (session.orgId && socket.user.orgId && session.orgId !== socket.user.orgId) {
    throw new Error("Forbidden")
  }
}

async function loadUserFromToken(token) {
  if (!token || typeof token !== "string") return null
  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    return null
  }
  if (!payload?.sub || payload.sub === "guest" || payload.type === "guest") return null
  const user = await User.findById(payload.sub).select("_id type orgId name deletedAt")
  if (!user || user.deletedAt) return null
  return {
    id: user._id,
    type: user.type,
    orgId: user.orgId ?? null,
    name: user.name,
  }
}

/**
 * Attach Socket.IO live-lesson realtime layer to an http.Server.
 * Does not alter Express routing — safe alongside existing REST API.
 */
export function attachLiveLessonRealtime(httpServer) {
  const cors = resolveCorsOptions({
    corsDisabled: env.corsDisabled,
    corsOriginsRaw: env.corsOrigins,
  })

  io = new Server(httpServer, {
    cors: {
      origin: cors.origin,
      credentials: cors.credentials !== false,
    },
    path: "/socket.io",
    // Keep connection churn low
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e5,
  })

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (typeof socket.handshake.headers?.authorization === "string" &&
        socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : null)

      const user = await loadUserFromToken(token)
      if (!user) return next(new Error("Unauthorized"))
      socket.user = user
      next()
    } catch (err) {
      next(err instanceof Error ? err : new Error("Unauthorized"))
    }
  })

  io.on("connection", (socket) => {
    socket.join(roomForUser(socket.user.id))

    socket.on("lesson:subscribe", async (payload, ack) => {
      try {
        const sessionId = payload?.sessionId
        if (!sessionId) throw new Error("sessionId is required")
        const session = await liveLessonService.getById(sessionId)
        await assertStaffSessionAccess(socket, session)
        await socket.join(roomForSession(session._id))
        const state = liveLessonService.serialize(session)
        socket.emit("lesson:state", state)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    // Teacher control events — prefer REST from admin UI; socket kept for low-latency optional use.
    // Always verify staff + org before mutating.

    socket.on("lesson:start", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.start(session._id)
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:pause", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.pause(session._id)
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:resume", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.resume(session._id)
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:finish", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.finish(session._id)
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:select-exercise", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.setCurrentExercise(session._id, payload?.exerciseId, {
          openForStudents: payload?.openForStudents,
        })
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:open-for-students", async (payload, ack) => {
      try {
        const session = await liveLessonService.getById(payload?.sessionId)
        await assertStaffSessionAccess(socket, session)
        const next = await liveLessonService.openForStudents(
          session._id,
          payload?.openForStudents ?? payload?.open,
        )
        const state = await broadcastSession(next)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:join", async (payload, ack) => {
      try {
        requireStudent(socket)
        const key = payload?.sessionId || payload?.code
        const session = await liveLessonService.studentJoin(key, socket.user.id)
        await socket.join(roomForSession(session._id))
        const state = await broadcastSession(session)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    // Heartbeat: cheap presence patch only — no full lesson:state fan-out.
    socket.on("lesson:heartbeat", async (payload, ack) => {
      try {
        requireStudent(socket)
        const patch = await liveLessonService.studentHeartbeat(payload?.sessionId, socket.user.id)
        await socket.join(roomForSession(patch.sessionId))
        emitLessonPresence(patch.sessionId, patch)
        if (typeof ack === "function") ack({ ok: true, patch })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })

    socket.on("lesson:progress", async (payload, ack) => {
      try {
        requireStudent(socket)
        const session = await liveLessonService.studentProgress(payload?.sessionId, socket.user.id, {
          progress: payload?.progress,
          score: payload?.score,
          status: payload?.status,
          answers: payload?.answers,
        })
        await socket.join(roomForSession(session._id))
        const state = await broadcastSession(session)
        if (typeof ack === "function") ack({ ok: true, state })
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, error: err.message })
      }
    })
  })

  return io
}
