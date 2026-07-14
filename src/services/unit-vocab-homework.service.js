/**
 * After a live-lesson unit is completed, auto-assign the matching Cambridge
 * unit vocabulary deck as homework for the group (idempotent).
 */
import { Homework } from "../models/Homework.js"
import { Submission } from "../models/Submission.js"
import { findStudentIdsInGroup } from "./group.service.js"
import { notifyMany } from "./notification.service.js"
import { resolveSubmissionTopicFields } from "./submissionTopic.service.js"

const DUE_DAYS = 7
const VOCAB_PREFIX = "vocab:"

export function cambridgeUnitVocabSlug(unitNumber) {
  return `cambridge-unit-${Number(unitNumber)}`
}

export function cambridgeUnitVocabExerciseSlug(unitNumber) {
  return `${VOCAB_PREFIX}${cambridgeUnitVocabSlug(unitNumber)}`
}

/**
 * @param {{ orgId: string, groupId: string, currentUnit: number | null | undefined }} session
 * @returns {Promise<{ created: boolean, homework: import("../models/Homework.js").Homework | null }>}
 */
export async function assignUnitVocabHomework(session) {
  const unitNumber = Number(session.currentUnit)
  if (!Number.isFinite(unitNumber) || unitNumber < 1) {
    return { created: false, homework: null }
  }

  const orgId = session.orgId
  const groupId = session.groupId
  if (!orgId || !groupId) {
    return { created: false, homework: null }
  }

  const exerciseSlug = cambridgeUnitVocabExerciseSlug(unitNumber)

  const existing = await Homework.findOne({
    orgId,
    groupId,
    subject: "vocabulary",
    exerciseSlug,
  }).lean()

  if (existing) {
    return { created: false, homework: existing }
  }

  const dueAt = new Date()
  dueAt.setDate(dueAt.getDate() + DUE_DAYS)

  const hw = await Homework.create({
    orgId,
    title: `Unit ${unitNumber} vocabulary`,
    description: `Vocabulary homework for Cambridge Vocabulary for IELTS Advanced — Unit ${unitNumber}.`,
    subject: "vocabulary",
    groupId,
    dueAt,
    estimatedMinutes: 20,
    createdBy: "System",
    exerciseSlug,
  })

  const studentIds = await findStudentIdsInGroup(groupId, orgId)
  if (studentIds.length) {
    const assignedAt = new Date()
    const topicDefaults = await resolveSubmissionTopicFields(hw)
    const docs = studentIds.map((studentId) => ({
      orgId,
      homeworkId: hw._id,
      studentId,
      topic: exerciseSlug,
      subject: "vocabulary",
      homeworkTitle: hw.title,
      ...topicDefaults,
      assignedAt,
      entryCount: 0,
      status: "pending",
      integrityStatus: "ok",
      events: [{ at: assignedAt, type: "assigned" }],
    }))
    await Submission.insertMany(docs, { ordered: false }).catch(() => {})
    await notifyMany(studentIds, {
      type: "homework",
      title: `New homework: ${hw.title}`,
      message: `Your tutor assigned Unit ${unitNumber} vocabulary. Due ${dueAt.toLocaleDateString()}.`,
      data: {
        homeworkTitle: hw.title,
        subject: "vocabulary",
        dueAt,
        status: "pending",
      },
    }).catch(() => {})
  }

  return { created: true, homework: hw }
}
