import { connectPlatformDB } from "../config/platformDb.js"
import { getOrganizationModel } from "../models/platform/Organization.js"
import { User } from "../models/User.js"
import { ACTIVE_STUDENT_FILTER } from "./student.service.js"
import { ApiError } from "../utils/ApiError.js"

const DEFAULT_LIMITS = { maxStudents: 50, maxTeachers: 5 }

async function getOrgLimits(orgId) {
  await connectPlatformDB()
  const Organization = getOrganizationModel()
  const org = await Organization.findById(orgId).select("limits status").lean()
  if (!org) throw ApiError.notFound("Organization not found")
  if (org.status === "blocked") {
    throw ApiError.forbidden("Organization is blocked")
  }
  return org.limits ?? DEFAULT_LIMITS
}

export async function countStudents(orgId) {
  return User.countDocuments({ orgId, type: "student", ...ACTIVE_STUDENT_FILTER })
}

export async function countTeachers(orgId) {
  return User.countDocuments({ orgId, type: "teacher" })
}

export async function assertCanAddStudent(orgId) {
  if (!orgId) return
  const limits = await getOrgLimits(orgId)
  const current = await countStudents(orgId)
  if (current >= limits.maxStudents) {
    throw ApiError.conflict(
      `Student limit reached (${current}/${limits.maxStudents}). Upgrade your plan or contact support.`,
    )
  }
}

export async function assertCanAddTeacher(orgId) {
  if (!orgId) return
  const limits = await getOrgLimits(orgId)
  const current = await countTeachers(orgId)
  if (current >= limits.maxTeachers) {
    throw ApiError.conflict(
      `Teacher limit reached (${current}/${limits.maxTeachers}). Upgrade your plan or contact support.`,
    )
  }
}
