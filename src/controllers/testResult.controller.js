import { TestResult } from "../models/TestResult.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"

export const saveTestResult = asyncHandler(async (req, res) => {
  const studentId = req.user.id
  const result = await TestResult.create({ ...req.body, studentId })
  res.status(201).json(result)
})

/** The authenticated student's own test results (staff can pass ?studentId). */
export const listTestResults = asyncHandler(async (req, res) => {
  let studentId = req.user.id
  if (req.user.role !== "student" && req.query.studentId) {
    studentId = req.query.studentId
  }
  const results = await TestResult.find({ studentId }).sort({ date: -1 })
  res.json(results)
})

export const getTestResult = asyncHandler(async (req, res) => {
  const result = await TestResult.findById(req.params.id)
  if (!result) throw ApiError.notFound("Result not found")
  if (req.user.role === "student") {
    const myId = req.user.id
    if (result.studentId !== myId) throw ApiError.forbidden()
  }
  res.json(result)
})
