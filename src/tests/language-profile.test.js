import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  confidenceFromQuestions,
  recencyWeight,
  MASTERY_ACCURACY,
  MASTERY_CONFIDENCE,
  MASTERY_MIN_QUESTIONS,
} from "../config/language-profile.js"
import { _internal } from "../services/studentLanguageProfile.service.js"

const { computeTopicStats, computeSkillScore, computeOverallSkillScores, scoreToLearnixLevel } =
  _internal

describe("language-profile confidence", () => {
  it("returns 0 for no questions", () => {
    assert.equal(confidenceFromQuestions(0), 0)
  })

  it("returns ~0.31 for 3 questions", () => {
    const c = confidenceFromQuestions(3)
    assert.ok(Math.abs(c - 0.316) < 0.01)
  })

  it("returns ~0.57 for 10 questions", () => {
    const c = confidenceFromQuestions(10)
    assert.ok(Math.abs(c - 0.577) < 0.01)
  })

  it("caps at 1 for 30+ questions", () => {
    assert.equal(confidenceFromQuestions(30), 1)
    assert.equal(confidenceFromQuestions(100), 1)
  })
})

describe("language-profile recency decay", () => {
  const now = new Date("2026-07-09T12:00:00Z")

  it("returns 1 for today", () => {
    assert.ok(Math.abs(recencyWeight(now, now) - 1) < 0.01)
  })

  it("returns ~0.5 after 90 days", () => {
    const at = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    assert.ok(Math.abs(recencyWeight(at, now) - 0.5) < 0.02)
  })

  it("returns ~0.25 after 180 days", () => {
    const at = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)
    assert.ok(Math.abs(recencyWeight(at, now) - 0.25) < 0.02)
  })
})

describe("language-profile topic mastery", () => {
  const now = new Date("2026-07-09T12:00:00Z")

  it("marks topic mastered at 75%+ with confidence >= 0.7 and 15+ questions", () => {
    const acc = {
      slug: "present-perfect",
      title: "Present Perfect",
      learnixLevel: 5,
      attempts: Array.from({ length: 5 }, () => ({
        correct: 16,
        total: 20,
        at: now,
        weight: 1.8,
      })),
    }
    const stats = computeTopicStats(acc, now)
    assert.ok(stats)
    assert.equal(stats.mastered, true)
    assert.equal(stats.needsReview, false)
    assert.ok(stats.weightedAccuracy >= MASTERY_ACCURACY)
    assert.ok(stats.confidence >= MASTERY_CONFIDENCE)
    assert.ok(stats.attemptedQuestions >= MASTERY_MIN_QUESTIONS)
  })

  it("does not master topic with only 3 questions at 100%", () => {
    const acc = {
      slug: "present-simple",
      title: "Present Simple",
      learnixLevel: 2,
      attempts: [{ correct: 3, total: 3, at: now, weight: 1.2 }],
    }
    const stats = computeTopicStats(acc, now)
    assert.ok(stats)
    assert.equal(stats.mastered, false)
    assert.ok(stats.confidence < MASTERY_CONFIDENCE)
  })

  it("flags needsReview when accuracy below 60%", () => {
    const acc = {
      slug: "conditionals",
      title: "Conditionals",
      learnixLevel: 7,
      attempts: Array.from({ length: 4 }, () => ({
        correct: 4,
        total: 10,
        at: now,
        weight: 2.2,
      })),
    }
    const stats = computeTopicStats(acc, now)
    assert.ok(stats)
    assert.equal(stats.needsReview, true)
    assert.ok(stats.weightedAccuracy < 60)
  })
})

describe("language-profile skill score", () => {
  it("prevents high level from few perfect topics", () => {
    const topics = [
      {
        slug: "present-simple",
        weightedAccuracy: 100,
        confidence: 0.32,
        learnixLevel: 2,
        mastered: false,
        attemptedQuestions: 3,
      },
    ]
    const skill = computeSkillScore(topics)
    assert.ok(skill.score < 400)
    assert.ok(skill.level <= 2)
  })

  it("computes overall from available skills only", () => {
    const overall = computeOverallSkillScores({
      grammar: { score: 620, confidence: 0.8, hasData: true, topics: [] },
      vocabulary: { score: 580, confidence: 0.7, hasData: true, topics: [] },
      speaking: { score: 0, confidence: 0, hasData: false, topics: [] },
    })
    assert.ok(overall.score > 580 && overall.score < 620)
    assert.ok(overall.confidence > 0)
  })

  it("uses confidence-weighted average not plain mean", () => {
    const overall = computeOverallSkillScores({
      grammar: { score: 620, confidence: 0.95, hasData: true, topics: [] },
      vocabulary: { score: 580, confidence: 0.9, hasData: true, topics: [] },
      speaking: { score: 900, confidence: 0.1, hasData: true, topics: [] },
    })
    assert.ok(overall.score < 650)
  })
})

describe("language-profile learnix level gates", () => {
  it("caps level when few topics attempted", () => {
    assert.ok(scoreToLearnixLevel(900, 2, 1) <= 2)
    assert.ok(scoreToLearnixLevel(900, 5, 1) <= 4)
  })

  it("caps level when level coverage is shallow", () => {
    const shallowCoverage = {
      "1": 80,
      "2": 10,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
      "7": 0,
      "8": 0,
      "9": 0,
    }
    const level = scoreToLearnixLevel(900, 20, 15, shallowCoverage)
    assert.ok(level <= 2)
  })
})

describe("language-profile coverage penalties", () => {
  const { adjustScoreForCoverage, applyBreadthPenalty } = _internal

  it("reduces inflated score when catalogue coverage is low", () => {
    const levelCoverage = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [String(i + 1), i < 2 ? 60 : 0]),
    )
    const adjusted = adjustScoreForCoverage(924, levelCoverage, 15, 200)
    assert.ok(adjusted < 600)
  })

  it("penalizes narrow topic breadth", () => {
    const penalized = applyBreadthPenalty(900, 3, 1)
    assert.ok(penalized < 500)
  })
})
