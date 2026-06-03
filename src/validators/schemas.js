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
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  }),
}

export const refreshSchema = {
  body: z.object({ refreshToken: z.string().min(10).optional() }),
}

// ---------- Group ----------
export const createGroupSchema = {
  body: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    teacherId: z.string().optional(),
    studentIds: z.array(z.string()).optional(),
    monthlyFee: z.number().nonnegative().optional(),
  }),
}
export const updateGroupSchema = {
  params: idParam,
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    teacherId: z.string().optional(),
    monthlyFee: z.number().nonnegative().optional(),
  }),
}
export const groupMemberSchema = {
  params: idParam,
  body: z.object({ studentId: z.string().min(1) }),
}

// ---------- Student ----------
export const createStudentSchema = {
  body: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(254),
    phone: z.string().max(40).optional(),
    groupId: z.string().optional(),
    monthlyFee: z.number().nonnegative().optional(),
    notes: z.string().max(1000).optional(),
  }),
}
export const updateStudentSchema = {
  params: idParam,
  body: createStudentSchema.body.partial(),
}

// ---------- Homework ----------
export const createHomeworkSchema = {
  body: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    subject: z.enum(["reading", "listening", "writing", "speaking", "grammar"]),
    groupId: z.string().min(1),
    dueAt: z.coerce.date(),
    estimatedMinutes: z.number().int().nonnegative().optional().default(0),
    createdBy: z.string().max(120).optional(),
    exerciseSlug: z.string().max(200).optional(),
    timeLimitMinutes: z.number().int().positive().optional(),
  }),
}

export const gradeSubmissionSchema = {
  params: idParam,
  body: z.object({
    score: z.number().min(0).max(9).optional(),
    feedback: z.string().max(2000).optional(),
    status: z.enum(["pending", "in_progress", "submitted", "graded"]).optional(),
  }),
}

export const recordAttemptSchema = {
  body: z.object({
    homeworkId: z.string().min(1),
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

export const startHomeworkSchema = {
  body: z.object({ homeworkId: z.string().min(1) }),
}

// ---------- Entry test ----------
export const assignEntrySchema = {
  body: z.object({ studentId: z.string().min(1) }),
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
    periodLabel: z.string().min(1).max(60),
    dueDate: z.coerce.date(),
    status: z.enum(["pending", "paid", "overdue"]).optional(),
    notes: z.string().max(500).optional(),
  }),
}
export const updatePaymentSchema = {
  params: idParam,
  body: z.object({
    amount: z.number().nonnegative().optional(),
    status: z.enum(["pending", "paid", "overdue"]).optional(),
    paidDate: z.coerce.date().nullable().optional(),
    notes: z.string().max(500).optional(),
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
  difficulty: z.enum(["easy", "medium", "hard"]).optional().default("easy"),
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
  order: z.number().int().optional(),
})

export const importCatalogSchema = {
  body: z.object({
    topics: z.array(topicInput).max(2000).optional().default([]),
    exercises: z.array(exerciseInput).max(5000).optional().default([]),
  }),
}

export const slugParamSchema = {
  params: z.object({ slug: z.string().min(1).max(200) }),
}

export const idParamSchema = { params: idParam }
