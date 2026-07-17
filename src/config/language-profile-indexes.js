/**
 * Production indexes for Language Profile at scale.
 * Apply via MongoDB or migration script when deploying.
 *
 * StudentLanguageProfile:
 *   { orgId: 1, "overall.level": -1 }
 *   { orgId: 1, "ieltsEstimation.estimatedBand": -1 }
 *   { studentId: 1 } unique
 *
 * StudentTopicMastery:
 *   { studentId: 1, topicId: 1 } unique
 *   { orgId: 1, studentId: 1, category: 1 }
 *   { studentId: 1, cefrLevel: 1 }
 *   { studentId: 1, masteryScore: -1 }
 *
 * StudentLanguageProfileSnapshot:
 *   { studentId: 1, createdAt: -1 }
 *
 * Event sources (already exist / recommend):
 *   Submission: { studentId: 1, status: 1, submittedAt: -1 }
 *   ExerciseEvent: { studentId: 1, at: -1 }
 *   WordAnswerEvent: { studentId: 1, at: -1 }
 *   TestResult: { studentId: 1, testType: 1, date: -1 }
 */

export const LANGUAGE_PROFILE_INDEXES = {
  StudentLanguageProfile: [
    { keys: { orgId: 1, "overall.level": -1 } },
    { keys: { orgId: 1, "ieltsEstimation.estimatedBand": -1 } },
  ],
  StudentTopicMastery: [
    { keys: { studentId: 1, topicId: 1 }, options: { unique: true } },
    { keys: { orgId: 1, studentId: 1, category: 1 } },
    { keys: { studentId: 1, cefrLevel: 1 } },
    { keys: { studentId: 1, masteryScore: -1 } },
  ],
  StudentLanguageProfileSnapshot: [
    { keys: { studentId: 1, createdAt: -1 } },
  ],
}
