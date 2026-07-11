import { connectPlatformDB } from "../config/platformDb.js"
import { getOrganizationModel } from "../models/platform/Organization.js"

async function ensurePlatformDb() {
  await connectPlatformDB()
}

export function formatOrgSettings(org) {
  return {
    allowScreenshots: org?.settings?.allowScreenshots === true,
    entryTestAutocomplete: org?.settings?.entryTestAutocomplete === true,
    failHomeworkOnAppExit: org?.settings?.failHomeworkOnAppExit !== false,
  }
}

export async function getOrgSettings(orgId) {
  if (!orgId) {
    return {
      allowScreenshots: false,
      entryTestAutocomplete: false,
      failHomeworkOnAppExit: true,
    }
  }

  await ensurePlatformDb()
  const Organization = getOrganizationModel()
  const org = await Organization.findById(orgId).lean()
  return formatOrgSettings(org)
}
