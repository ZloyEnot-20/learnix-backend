import { z } from "zod"

const idParam = z.object({ id: z.string().min(1) })
const bookIdParam = z.object({ bookId: z.string().min(1) })
const bookUnitParams = z.object({
  bookId: z.string().min(1),
  unitNumber: z.coerce.number().int().positive(),
})
const codeParam = z.object({
  code: z
    .string()
    .min(4)
    .max(12)
    .transform((v) => v.trim().toUpperCase()),
})

export const listLiveLessonBooksSchema = {}

export const getLiveLessonBookSchema = {
  params: bookIdParam,
}

export const getLiveLessonBookUnitSchema = {
  params: bookUnitParams,
}

export const createLiveLessonSchema = {
  body: z.object({
    groupId: z.string().min(1),
    bookId: z.string().min(1).optional(),
    unitNumber: z.coerce.number().int().positive(),
  }),
}

export const liveLessonIdSchema = {
  params: idParam,
}

export const selectLiveLessonExerciseSchema = {
  params: idParam,
  body: z.object({
    exerciseId: z.string().min(1),
    openForStudents: z.boolean().optional(),
  }),
}

export const openLiveLessonSchema = {
  params: idParam,
  body: z.object({
    openForStudents: z.boolean(),
  }),
}

export const joinLiveLessonByCodeSchema = {
  params: codeParam,
}

export const studentLiveLessonProgressSchema = {
  params: idParam,
  body: z.object({
    progress: z.coerce.number().min(0).max(100),
    score: z.coerce.number().nullable().optional(),
    status: z.enum(["offline", "online", "working", "done"]).optional(),
    answers: z.any().optional(),
  }),
}

export const studentLiveLessonHeartbeatSchema = {
  params: idParam,
}
