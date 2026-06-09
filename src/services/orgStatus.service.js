import { connectPlatformDB } from "../config/platformDb.js"
import { getOrganizationModel } from "../models/platform/Organization.js"

export async function getOrgStatus(orgId) {
  if (!orgId) return null
  await connectPlatformDB()
  const Organization = getOrganizationModel()
  const org = await Organization.findById(orgId).select("status").lean()
  return org?.status ?? null
}
