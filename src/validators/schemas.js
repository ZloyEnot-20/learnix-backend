import { z } from "zod"

const CEFR = [
  "Beginner (A1)",
  "Elementary (A2)",
  "Pre-Intermediate (B1)",
  "Intermediate (B1+)",
  "Upper-Intermediate (B2)",
  "Strong B2 / B2+",
]

const idParam = z.object({ id: z.string().min(1) })

// ---------- Auth ----------
export const registerSchema = {
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(120),
  }),
}

export const loginSchema = {
  body: z.object({
    login: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  }),
}

export const refreshSchema = {
  body: z.object({ refreshToken: z.string().min(10).optional() }),
}

// ---------- Group ----------
function normalizeTimeHHmm(value) {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)/)
  return match ? `${match[1]}:${match[2]}` : trimmed
}

const timeHHmm = z.preprocess(
  normalizeTimeHHmm,
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format"),
)
const lessonWeekdaysField = z
  .array(z.coerce.number().int().min(0).max(6))
  .min(1, "Select at least one weekday")

function assertLessonTimeOrder(startTime, endTime, ctx) {
  if (startTime >= endTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End time must be after start time",
      path: ["lessonEndTime"],
    })
  }
}

export const createGroupSchema = {
  body: z
    .object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      teacherId: z.string().optional(),
      studentIds: z.array(z.string()).optional(),
      monthlyFee: z.number().nonnegative().optional(),
      lessonWeekdays: lessonWeekdaysField,
      lessonStartTime: timeHHmm,
      lessonEndTime: timeHHmm,
    })
    .superRefine((data, ctx) => assertLessonTimeOrder(data.lessonStartTime, data.lessonEndTime, ctx)),
}
export const updateGroupSchema = {
  params: idParam,
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(500).optional(),
      teacherId: z.string().optional(),
      monthlyFee: z.number().nonnegative().optional(),
      lessonWeekdays: lessonWeekdaysField.optional(),
      lessonStartTime: timeHHmm.optional(),
      lessonEndTime: timeHHmm.optional(),
    })
    .superRefine((data, ctx) => {
      if (data.lessonStartTime && data.lessonEndTime) {
        assertLessonTimeOrder(data.lessonStartTime, data.lessonEndTime, ctx)
      }
    }),
}
export const groupMemberSchema = {
  params: idParam,
  body: z.object({ studentId: z.string().min(1) }),
}

// ---------- Student ----------
/** Treat missing, null, or blank strings as undefined (optional field). */
function optionalBlankString(max) {
  return z.preprocess(
    (val) => {
      if (val === undefined || val === null) return undefined
      const trimmed = String(val).trim()
      return trimmed.length > 0 ? trimmed : undefined
    },
    z.string().max(max).optional(),
  )
}

const optionalEmail = z.preprocess(
  (val) => {
    if (val === undefined || val === null) return undefined
    const trimmed = String(val).trim()
    return trimmed.length > 0 ? trimmed.toLowerCase() : undefined
  },
  z.string().email().max(254).optional(),
)

export const createStudentSchema = {
  body: z.object({
    name: z.string().min(1).max(120),
    login: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9._-]+$/, "Login may only contain lowercase letters, digits, . _ -"),
    email: optionalEmail,
    phone: optionalBlankString(20),
    groupId: z.string().optional(),
    monthlyFee: z.number().nonnegative().optional(),
    notes: z.string().max(1000).optional(),
    targetBand: z.number().min(4).max(9).nullable().optional(),
    targetExamDate: z.coerce.date().nullable().optional(),
  }),
}
export const updateStudentSchema = {
  params: idParam,
  body: createStudentSchema.body.partial(),
}
export const loginSuggestionsSchema = {
  query: z.object({ name: z.string().min(1).max(120) }),
}

export const sendStudentNotificationSchema = {
  params: idParam,
  body: z.object({
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(1000),
    type: z.enum(["system", "reminder", "achievement"]).optional(),
  }),
}

export const pushTokenRegisterSchema = {
  params: idParam,
  body: z.object({
    token: z.string().min(1).max(4096),
    platform: z.enum(["ios", "android"]),
  }),
}

export const pushTokenUnregisterSchema = {
  params: idParam,
  body: z.object({
    token: z.string().min(1).max(4096),
  }),
}

// ---------- Homework ----------
export const createHomeworkSchema = {
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    subject: z.enum(["reading", "listening", "writing", "speaking", "grammar", "vocabulary"]),
    groupId: z.string().min(1),
    dueAt: z.coerce.date(),
    estimatedMinutes: z.number().int().nonnegative().optional().default(0),
    createdBy: z.string().max(120).optional(),
    exerciseSlug: z.string().max(200).optional(),
    timeLimitMinutes: z.number().int().positive().optional(),
    masteryMode: z.boolean().optional(),
    requiredAccuracy: z.number().min(0).max(1).optional(),
  }),
}

const speakingRecordingGradeSchema = z.object({
  questionId: z.number(),
  score: z.number().min(0).max(9).optional(),
  grammarScore: z.number().min(0).max(10).optional(),
  vocabularyScore: z.number().min(0).max(10).optional(),
  fluencyScore: z.number().min(0).max(10).optional(),
  pronunciationScore: z.number().min(0).max(10).optional(),
  feedback: z.string().max(2000).optional(),
})

export const gradeSubmissionSchema = {
  params: idParam,
  body: z.object({
    score: z.number().min(0).max(9).optional(),
    feedback: z.string().max(2000).optional(),
    status: z
      .enum(["pending", "in_progress", "paused", "needs_retry", "submitted", "graded"])
      .optional(),
    /** Per-question speaking grades — merged into attempt.mistakes by questionId. */
    recordingGrades: z.array(speakingRecordingGradeSchema).optional(),
  }),
}

const attemptItemSchema = z.object({
  questionId: z.number(),
  prompt: z.string().optional().default(""),
  isCorrect: z.boolean(),
})

const attemptBodySchema = z.object({
  totalQuestions: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative().optional(),
  timedOut: z.boolean().optional(),
  answeredCount: z.number().int().nonnegative().optional(),
  mode: z.enum(["full", "mistakes_only"]).optional(),
  items: z.array(attemptItemSchema).optional(),
  mistakes: z
    .array(
      z.object({
        questionId: z.number(),
        prompt: z.string(),
        userAnswer: z.string(),
        correctAnswer: z.string(),
        explanation: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  listeningStats: z
    .object({
      totalListenSeconds: z.number().nonnegative(),
      seekCount: z.number().int().nonnegative(),
      rewindCount: z.number().int().nonnegative(),
      forwardCount: z.number().int().nonnegative(),
      seeks: z
        .array(
          z.object({
            fromSeconds: z.number().nonnegative(),
            toSeconds: z.number().nonnegative(),
            atMs: z.number().nonnegative(),
          }),
        )
        .optional()
        .default([]),
      listenedSegments: z
        .array(
          z.object({
            startSeconds: z.number().nonnegative(),
            endSeconds: z.number().nonnegative(),
          }),
        )
        .optional()
        .default([]),
      podcastDurationSeconds: z.number().nonnegative(),
      completedListening: z.boolean(),
      wordsReviewed: z.number().int().nonnegative(),
    })
    .optional(),
  readingAnswers: z
    .array(
      z.object({
        questionId: z.number(),
        userAnswer: z.string(),
      }),
    )
    .optional(),
})

export const recordAttemptSchema = {
  body: z.object({
    homeworkId: z.string().min(1),
    attempt: attemptBodySchema,
  }),
}

export const saveHomeworkProgressSchema = {
  body: z.object({
    homeworkId: z.string().min(1),
    attempt: attemptBodySchema,
  }),
}

export const startHomeworkSchema = {
  body: z.object({
    homeworkId: z.string().min(1),
    skipEntryCount: z.boolean().optional().default(false),
  }),
}

export const recordHomeworkEntrySchema = {
  body: z.object({ homeworkId: z.string().min(1) }),
}

export const reportViolationSchema = {
  body: z.object({
    homeworkId: z.string().min(1),
    reason: z
      .enum(["app_background", "network_lost", "navigation", "unknown"])
      .optional()
      .default("unknown"),
  }),
}

export const createIssueReportSchema = {
  body: z
    .object({
      homeworkId: z.string().min(1).optional(),
      controlWorkId: z.string().min(1).optional(),
      liveLessonId: z.string().min(1).optional(),
      bookId: z.string().min(1).optional(),
      unitNumber: z.number().int().min(1).optional(),
      exerciseId: z.string().min(1).max(80).optional(),
      stepIndex: z.number().int().min(0).optional(),
      exerciseSlug: z.string().min(1).max(200),
      exerciseTitle: z.string().min(1).max(300),
      exerciseKind: z.enum([
        "grammar",
        "vocabulary",
        "podcast",
        "speaking",
        "listening",
        "reading",
        "book",
      ]),
      questionIndex: z.number().int().min(0).optional(),
      questionId: z.number().int().min(0).optional(),
      questionPrompt: z.string().max(2000).optional(),
      message: z.string().max(50).optional(),
    }),
}

export const updateIssueReportSchema = {
  params: idParam,
  body: z.object({
    status: z.enum(["open", "resolved", "dismissed"]),
  }),
}

// ---------- Entry test ----------
export const assignEntrySchema = {
  body: z.object({ studentId: z.string().min(1) }),
}
export const assignPhoneEntrySchema = {
  body: z.object({
    name: z.string().min(1).max(200),
    phone: z.string().min(5).max(30),
    login: z.string().min(1).max(64).optional(),
    email: z.string().email().max(254).optional().or(z.literal("")),
    notes: z.string().max(500).optional(),
  }),
}
export const phoneLookupSchema = {
  body: z.object({
    phone: z.string().min(5).max(30),
    orgId: z.string().min(1).optional(),
  }),
}
const publicPhoneBody = z.object({
  phone: z.string().min(5).max(30),
})
export const publicSaveMcSchema = {
  params: idParam,
  body: publicPhoneBody.extend({
    answers: z.record(z.string(), z.string()),
    completed: z.boolean().default(false),
  }),
}
export const publicSaveReadingSchema = {
  params: idParam,
  body: publicPhoneBody.extend({
    answers: z.record(z.string(), z.union([z.number(), z.boolean()])),
    completed: z.boolean().default(false),
  }),
}
export const publicWritingDraftSchema = {
  params: idParam,
  body: publicPhoneBody.extend({ text: z.string().max(20000) }),
}
export const publicSubmitWritingSchema = {
  params: idParam,
  body: publicPhoneBody.extend({ text: z.string().max(20000) }),
}
export const saveMcSchema = {
  params: idParam,
  body: z.object({
    answers: z.record(z.string(), z.string()),
    completed: z.boolean().default(false),
  }),
}
export const saveReadingSchema = {
  params: idParam,
  body: z.object({
    answers: z.record(z.string(), z.union([z.number(), z.boolean()])),
    completed: z.boolean().default(false),
  }),
}
export const writingDraftSchema = {
  params: idParam,
  body: z.object({ text: z.string().max(20000) }),
}
export const submitWritingSchema = {
  params: idParam,
  body: z.object({ text: z.string().max(20000) }),
}
export const gradeWritingSchema = {
  params: idParam,
  body: z.object({
    writingLevel: z.enum(CEFR),
    overallLevel: z.enum(CEFR),
    feedback: z.string().max(2000).optional(),
  }),
}

// ---------- Payment ----------
export const createPaymentSchema = {
  body: z.object({
    studentId: z.string().min(1),
    groupId: z.string().min(1),
    amount: z.number().nonnegative(),
    paidAmount: z.number().nonnegative().optional(),
    periodLabel: z.string().min(1).max(60),
    dueDate: z.coerce.date(),
    status: z.enum(["pending", "partial", "paid", "overdue"]).optional(),
    notes: z.string().max(500).optional(),
  }),
}
export const updatePaymentSchema = {
  params: idParam,
  body: z.object({
    amount: z.number().nonnegative().optional(),
    paidAmount: z.number().nonnegative().optional(),
    status: z.enum(["pending", "partial", "paid", "overdue"]).optional(),
    paidDate: z.coerce.date().nullable().optional(),
    notes: z.string().max(500).optional(),
  }),
}
export const recordPaymentSchema = {
  params: idParam,
  body: z.object({
    paidAmount: z.number().positive().optional(),
  }),
}

// ---------- Lessons & attendance ----------
const attendanceStatus = z.enum(["present", "absent", "late", "excused"])
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
const monthOnly = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM")

export const listLessonsSchema = {
  query: z.object({
    groupId: z.string().min(1),
    month: monthOnly.optional(),
  }),
}

export const createLessonSchema = {
  body: z.object({
    groupId: z.string().min(1),
    date: dateOnly,
    topic: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }),
}

export const deleteLessonSchema = {
  params: idParam,
  query: z.object({
    scope: z.enum(["single", "weekday-future"]).optional().default("single"),
  }),
}

export const updateLessonSchema = {
  params: idParam,
  body: z
    .object({
      topic: z.string().max(200).optional(),
      notes: z.string().max(2000).optional(),
      canceled: z.boolean().optional(),
      cancelReason: z.string().max(1000).optional(),
      attendance: z
        .array(
          z.object({
            studentId: z.string().min(1),
            status: attendanceStatus,
            notes: z.string().max(500).optional(),
          }),
        )
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.canceled === true && !data.cancelReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Comment is required when canceling a lesson",
          path: ["cancelReason"],
        })
      }
      if (data.attendance?.length && !data.topic?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Topic is required when saving attendance",
          path: ["topic"],
        })
      }
    }),
}

// ---------- Analytics ----------
export const recordEventSchema = {
  body: z.object({
    topic: z.string().min(1),
    subtopic: z.string().optional(),
    slug: z.string().min(1),
    title: z.string().min(1),
    type: z.string().min(1),
    correctCount: z.number().int().nonnegative(),
    totalQuestions: z.number().int().nonnegative(),
    timedOut: z.boolean().optional(),
    source: z.enum(["game", "homework", "control_work"]).optional(),
    homeworkId: z.string().optional(),
    controlWorkId: z.string().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
  }),
}

export const recordVocabSchema = {
  body: z.object({
    deckSlug: z.string().min(1),
    deckTitle: z.string().min(1),
    correct: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    source: z.enum(["game", "homework"]).optional(),
    totalWords: z.number().int().nonnegative().optional(),
    wordAnswers: z
      .array(
        z.object({
          term: z.string().min(1),
          correct: z.boolean(),
          interactionType: z.string().optional(),
          deckSlug: z.string().optional(),
        }),
      )
      .optional(),
    words: z
      .array(
        z.object({
          term: z.string().min(1),
          partOfSpeech: z.string().optional(),
          definition: z.string().optional(),
          deckSlug: z.string().optional(),
          deckTitle: z.string().optional(),
        }),
      )
      .optional(),
  }),
}

export const recordVocabWordSchema = {
  body: z.object({
    term: z.string().min(1),
    deckSlug: z.string().min(1),
    correct: z.boolean(),
    interactionType: z.string().optional(),
  }),
}

export const syncLearnSchema = {
  body: z.object({
    studyWords: z
      .array(
        z.object({
          term: z.string().min(1),
          deckSlug: z.string().min(1),
          correctCount: z.number().int().nonnegative().optional(),
          totalAttempts: z.number().int().nonnegative().optional(),
          masteredAt: z.string().optional(),
          permanentlyMastered: z.boolean().optional(),
          wantToLearn: z.boolean().optional(),
          lastReviewedAt: z.string().optional(),
          incorrectCount: z.number().int().nonnegative().optional(),
        }),
      )
      .optional()
      .default([]),
    vocabResults: z
      .array(
        z.object({
          deckSlug: z.string().min(1),
          deckTitle: z.string().optional(),
          correct: z.number().int().nonnegative(),
          total: z.number().int().positive(),
          completedAt: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
  }),
}

// ---------- Test result ----------
export const saveTestResultSchema = {
  body: z.object({
    testType: z.enum(["reading", "listening", "writing", "speaking"]),
    bandScore: z.number().min(0).max(9),
    totalCorrect: z.number().int().nonnegative(),
    totalQuestions: z.number().int().nonnegative(),
    answers: z.record(z.string(), z.string()).optional().default({}),
    parts: z.array(z.any()).optional().default([]),
  }),
}

// ---------- Exercises catalogue ----------
const exerciseInput = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().default(""),
  category: z.enum(["grammar", "vocabulary"]).optional().default("grammar"),
  topic: z.string().min(1).max(200),
  subtopic: z.string().max(200).optional().default(""),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional().default("easy"),
  level: z.string().max(40).optional().default(""),
  type: z.string().min(1).max(60),
  estimatedTime: z.number().int().nonnegative().optional().default(0),
  totalQuestions: z.number().int().nonnegative().optional().default(0),
  passingScore: z.number().int().nonnegative().optional().default(0),
  tags: z.array(z.string()).optional().default([]),
  instructions: z.string().max(4000).optional().default(""),
  tips: z.array(z.string()).optional().default([]),
  // Question/pair content is type-specific; validated loosely to stay lossless.
  content: z.record(z.string(), z.any()).optional().default({}),
})

const topicInput = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  levels: z.string().max(60).optional().default(""),
  exerciseCount: z.number().int().nonnegative().optional().default(0),
  questionCount: z.number().int().nonnegative().optional().default(0),
  totalMinutes: z.number().int().nonnegative().optional().default(0),
  color: z.string().max(40).optional().default(""),
  order: z.number().int().optional(),
})

export const importCatalogSchema = {
  body: z.object({
    topics: z.array(topicInput).max(2000).optional().default([]),
    exercises: z.array(exerciseInput).max(5000).optional().default([]),
  }),
}

const vocabWordInput = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  partOfSpeech: z.string().max(40).optional().default("noun"),
  definition: z.string().max(2000).optional().default(""),
  example: z.string().max(2000).optional().default(""),
  translation: z.string().max(2000).optional().default(""),
  translationUz: z.string().max(2000).optional().default(""),
})

const vocabDeckInput = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  level: z.string().max(40).optional().default("A1"),
  words: z.array(vocabWordInput).min(1).max(1000),
  order: z.number().int().optional(),
})

export const importVocabSchema = {
  body: z.object({
    decks: z.array(vocabDeckInput).max(500).optional().default([]),
  }),
}

const manageVocabWordInput = z.object({
  id: z.string().max(120).optional(),
  term: z.string().min(1).max(200),
  partOfSpeech: z.string().max(40).optional().default("noun"),
  definition: z.string().max(2000).optional().default(""),
  example: z.string().max(2000).optional().default(""),
  translation: z.string().max(2000).optional().default(""),
  translationUz: z.string().max(2000).optional().default(""),
})

export const manageOrgVocabSchema = {
  body: z
    .object({
      mode: z.enum(["create", "append"]),
      deckSlug: z.string().max(200).optional(),
      title: z.string().max(200).optional(),
      topic: z.string().max(200).optional(),
      level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().default("A1"),
      difficulty: z.enum(["easy", "medium", "hard"]).optional().default("medium"),
      words: z.array(manageVocabWordInput).min(1).max(200),
    })
    .superRefine((data, ctx) => {
      if (data.mode === "create") {
        if (!data.title?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title is required", path: ["title"] })
        }
        if (!data.topic?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "topic is required", path: ["topic"] })
        }
      }
      if (data.mode === "append" && !data.deckSlug?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "deckSlug is required", path: ["deckSlug"] })
      }
    }),
}

const podcastWordInput = z.object({
  word: z.string().min(1).max(200).optional(),
  term: z.string().min(1).max(200).optional(),
  definition: z.string().max(2000).optional().default(""),
  meaning: z.string().max(2000).optional(),
}).refine((w) => Boolean((w.word ?? w.term ?? "").trim()), {
  message: "word is required",
}).transform((w) => ({
  word: (w.word ?? w.term ?? "").trim(),
  definition: (w.definition ?? w.meaning ?? "").trim(),
}))

const podcastInput = z.object({
  slug: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200),
  topic: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().default("A1"),
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("easy"),
  audioUrl: z.string().min(1).max(2000),
  durationMinutes: z.number().nonnegative().optional().default(0),
  words: z.array(podcastWordInput).max(500).optional().default([]),
  order: z.number().int().optional(),
})

const manageSpeakingPromptInput = z.object({
  text: z.string().min(1).max(2000),
  hint: z.string().max(2000).optional().default(""),
  explanation: z.string().max(2000).optional().default(""),
})

export const manageOrgSpeakingSchema = {
  body: z
    .object({
      mode: z.enum(["create", "append"]),
      exerciseSlug: z.string().max(200).optional(),
      title: z.string().max(200).optional(),
      level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().default("A1"),
      prompts: z.array(manageSpeakingPromptInput).min(1).max(100),
    })
    .superRefine((data, ctx) => {
      if (data.mode === "create" && !data.title?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "title is required", path: ["title"] })
      }
      if (data.mode === "append" && !data.exerciseSlug?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "exerciseSlug is required",
          path: ["exerciseSlug"],
        })
      }
    }),
}

export const importPodcastSchema = {
  body: z.object({
    podcasts: z.array(podcastInput).max(500).optional().default([]),
  }),
}

const readingPartInput = z.object({
  partNumber: z.number().int().positive(),
  title: z.string().min(1).max(200),
  instruction: z.string().max(2000).optional().default(""),
  passageTitle: z.string().max(200).optional(),
  questionInstruction: z.string().max(4000).optional(),
  passage: z.string().min(1),
  totalQuestions: z.number().int().nonnegative().optional(),
  sections: z.array(z.record(z.unknown())).max(20).optional(),
  questions: z.array(z.record(z.unknown())).max(100).optional().default([]),
})

const readingTestDataInput = z.object({
  id: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200),
  totalTimeMinutes: z.number().nonnegative().optional().default(20),
  parts: z.array(readingPartInput).min(1).max(10),
})

const readingInput = z.object({
  slug: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(200).optional(),
  totalTimeMinutes: z.number().nonnegative().optional(),
  questionCount: z.number().int().nonnegative().optional(),
  subtitle: z.string().max(500).optional(),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  order: z.number().int().optional(),
  data: readingTestDataInput.optional(),
  parts: z.array(readingPartInput).min(1).max(10).optional(),
}).refine((v) => v.data != null || v.parts != null, {
  message: "data or parts is required",
})

export const importReadingSchema = {
  body: z.object({
    readings: z.array(readingInput).max(500).optional().default([]),
  }),
}

const listeningInput = z.object({
  slug: z.string().min(1).max(200).optional(),
  title: z.string().min(1).max(300).optional(),
  subtitle: z.string().max(500).optional(),
  book: z.number().int().positive().optional(),
  test: z.number().int().positive().optional(),
  totalTimeMinutes: z.number().int().positive().max(180).optional(),
  questionCount: z.number().int().nonnegative().max(60).optional(),
  fullAudioUrl: z.string().max(2000).optional(),
  order: z.number().int().optional(),
  data: z.record(z.unknown()).optional(),
  parts: z.array(z.record(z.unknown())).min(1).max(10).optional(),
  questionDetails: z.array(z.record(z.unknown())).optional(),
}).refine((v) => v.data != null || v.parts != null, {
  message: "data or parts is required",
})

export const importListeningSchema = {
  body: z.object({
    listenings: z.array(listeningInput).max(500).optional().default([]),
  }),
}

export const slugParamSchema = {
  params: z.object({ slug: z.string().min(1).max(200) }),
}

export const exerciseMetaBatchSchema = {
  body: z.object({
    slugs: z.array(z.string().min(1).max(200)).max(50).optional().default([]),
  }),
}

export const idParamSchema = { params: idParam }

const controlSectionSubject = z.enum([
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "writing",
])

const controlSectionConfig = z.object({
  mode: z.enum(["manual", "mix"]).optional(),
  topicSlugs: z.array(z.string().min(1)).optional(),
  exerciseSlugs: z.array(z.string().min(1)).optional(),
  deckSlugs: z.array(z.string().min(1)).optional(),
  mixCount: z.number().int().positive().max(50).optional(),
  testId: z.string().min(1).max(200).optional(),
  testTitle: z.string().max(200).optional(),
})

export const createControlWorkSchema = {
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    groupId: z.string().min(1),
    dueAt: z.coerce.date(),
    timeLimitMinutes: z.number().int().positive().optional(),
    createdBy: z.string().max(120).optional(),
    sectionOrder: z.array(controlSectionSubject).min(1).max(5),
    sections: z
      .object({
        vocabulary: controlSectionConfig.optional(),
        grammar: controlSectionConfig.optional(),
        reading: controlSectionConfig.optional(),
        listening: controlSectionConfig.optional(),
        writing: controlSectionConfig.optional(),
      })
      .optional()
      .default({}),
  }),
}

export const startControlWorkSchema = {
  body: z.object({ controlWorkId: z.string().min(1) }),
}

export const completeControlWorkStepSchema = {
  body: z.object({
    controlWorkId: z.string().min(1),
    stepIndex: z.number().int().nonnegative(),
    attempt: z.object({
      totalQuestions: z.number().int().nonnegative(),
      correctCount: z.number().int().nonnegative(),
      durationSeconds: z.number().int().nonnegative().optional(),
      timedOut: z.boolean().optional(),
      answeredCount: z.number().int().nonnegative().optional(),
      mistakes: z
        .array(
          z.object({
            questionId: z.number(),
            prompt: z.string(),
            userAnswer: z.string(),
            correctAnswer: z.string(),
            explanation: z.string().optional(),
          }),
        )
        .optional()
        .default([]),
    }),
  }),
}

export const reportControlWorkViolationSchema = {
  body: z.object({
    controlWorkId: z.string().min(1),
    reason: z.string().max(120).optional(),
  }),
}

// ---------- Staff users (org admin) ----------
const staffType = z.enum(["admin", "teacher"])
const staffTypeSuper = z.enum(["super_admin", "admin", "teacher"])

export const createUserSchema = {
  body: z.object({
    name: z.string().min(1).max(120),
    login: z.string().min(1).max(64),
    email: optionalEmail,
    type: staffTypeSuper,
  }),
}

export const updateUserSchema = {
  params: idParam,
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    login: z.string().min(1).max(64).optional(),
    email: optionalEmail,
    type: staffTypeSuper.optional(),
  }),
}

export const updateUserPermissionsSchema = {
  params: idParam,
  body: z.object({
    permissions: z.array(z.string()).default([]),
  }),
}

// ---------- Organization settings ----------
export const updateOrgSettingsSchema = {
  body: z
    .object({
      allowScreenshots: z.boolean().optional(),
      entryTestAutocomplete: z.boolean().optional(),
      failHomeworkOnAppExit: z.boolean().optional(),
    })
    .refine(
      (data) =>
        data.allowScreenshots !== undefined ||
        data.entryTestAutocomplete !== undefined ||
        data.failHomeworkOnAppExit !== undefined,
      { message: "At least one setting is required" },
    ),
}

// ---------- Telegram bot invites ----------
export const createInviteSchema = {
  body: z.object({
    studentId: z.string().min(1),
    ttlHours: z.number().int().positive().max(24 * 30).optional(),
  }),
}

// ---------- Speech recognition (Whisper) ----------
export const speechTestSchema = {
  body: z.object({
    url: z.string().url(),
  }),
}

// ---------- Admin panel ----------
export const adminBroadcastSchema = {
  body: z.object({
    audience: z.enum(["all", "group", "student"]),
    audienceId: z.string().min(1).optional(),
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(1000),
  }).superRefine((data, ctx) => {
    if (data.audience !== "all" && !data.audienceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "audienceId is required for group and student audiences",
        path: ["audienceId"],
      })
    }
  }),
}

export const adminAlertReadSchema = {
  body: z.object({ alertKey: z.string().min(1).max(200) }),
}

export const adminReadAllAlertsSchema = {
  body: z.object({
    alertKeys: z.array(z.string().min(1).max(200)),
  }),
}
