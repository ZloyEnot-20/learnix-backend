import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { computeMasteryScore, _internal as topicInternal } from "../services/topicMastery.service.js"
import { buildCefrProfile, bandFromCefrProgress } from "../services/cefrProfile.service.js"
import { estimateIeltsBand, applyBandCeiling } from "../services/ieltsEstimation.service.js"
import { buildIeltsRecommendations } from "../services/ieltsRecommendationEngine.service.js"
import { MASTERY_SCORE_MASTERED } from "../config/ielts-topic-catalogue.js"

describe("topic mastery score", () => {
  const now = new Date("2026-07-09T12:00:00Z")

  it("returns high score for strong recent performance", () => {
    const result = computeMasteryScore({
      weightedAccuracy: 90,
      confidence: 0.9,
      attempts: 8,
      lastAttemptAt: now,
      rawAttempts: [
        { correct: 18, total: 20 },
        { correct: 17, total: 20 },
        { correct: 19, total: 20 },
      ],
      now,
    })
    assert.ok(result.masteryScore >= MASTERY_SCORE_MASTERED)
    assert.equal(result.masteryStatus, "mastered")
  })

  it("returns partial for moderate performance", () => {
    const result = computeMasteryScore({
      weightedAccuracy: 68,
      confidence: 0.5,
      attempts: 3,
      lastAttemptAt: now,
      now,
    })
    assert.ok(result.masteryScore >= 40 && result.masteryScore < MASTERY_SCORE_MASTERED)
  })

  it("returns not_mastered for weak performance", () => {
    const result = computeMasteryScore({
      weightedAccuracy: 40,
      confidence: 0.2,
      attempts: 1,
      lastAttemptAt: new Date("2025-01-01"),
      now,
    })
    assert.ok(result.masteryScore < 60)
    assert.equal(result.masteryStatus, "not_mastered")
  })
})

describe("CEFR profile", () => {
  it("computes weighted average per level", () => {
    const masteries = [
      { topicId: "verb-to-be", masteryScore: 100, category: "grammar" },
      { topicId: "present-simple", masteryScore: 80, category: "grammar" },
      { topicId: "vocab-a1", masteryScore: 90, category: "vocabulary" },
    ]
    const profile = buildCefrProfile(masteries, { includeZeroDataTopics: false })
    assert.ok(profile.A1 > 0)
  })

  it("band progression: A1 mastered → 4.5", () => {
    const profile = { A1: 85, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 }
    assert.equal(bandFromCefrProgress(profile), 4.5)
  })

  it("band progression: B2 70% → 6.5", () => {
    const profile = { A1: 100, A2: 100, B1: 80, B2: 75, C1: 20, C2: 0 }
    assert.equal(bandFromCefrProgress(profile), 6.5)
  })

  it("band progression: B2 80% + C1 40% → 7.0", () => {
    const profile = { A1: 100, A2: 100, B1: 90, B2: 85, C1: 45, C2: 0 }
    assert.equal(bandFromCefrProgress(profile), 7.0)
  })
})

describe("IELTS estimation ceiling logic", () => {
  it("caps estimate when critical topics unmastered despite high reading/listening", () => {
    const topicMasteries = [
      { topicId: "conditionals", masteryScore: 45, category: "grammar", cefrLevel: "B2", attemptedQuestions: 20 },
      { topicId: "mixed-conditionals", masteryScore: 30, category: "grammar", cefrLevel: "B2", attemptedQuestions: 10 },
      { topicId: "nominalisation", masteryScore: 25, category: "grammar", cefrLevel: "C1", attemptedQuestions: 5 },
      { topicId: "academic-core", masteryScore: 40, category: "academic_vocabulary", cefrLevel: "B2", attemptedQuestions: 15 },
      { topicId: "verb-to-be", masteryScore: 95, category: "grammar", cefrLevel: "A1", attemptedQuestions: 50 },
      { topicId: "passive-voice", masteryScore: 70, category: "grammar", cefrLevel: "B2", attemptedQuestions: 30 },
    ]

    const skillProfiles = {
      grammar: { hasData: true, score: 650, confidence: 0.8 },
      vocabulary: { hasData: true, score: 600, confidence: 0.7 },
      reading: { hasData: true, score: 778, confidence: 0.9 }, // ~7.5 band
      listening: { hasData: true, score: 800, confidence: 0.9 }, // ~8.0 band
      speaking: { hasData: false, score: 0 },
      writing: { hasData: false, score: 0 },
    }

    const estimation = estimateIeltsBand({ topicMasteries, skillProfiles })

    assert.ok(estimation.estimatedBand <= 6.5, `Expected ceiling ≤6.5, got ${estimation.estimatedBand}`)
    assert.ok(estimation.limitingFactors.length > 0)
    assert.ok(
      estimation.limitingFactors.some((f) =>
        ["Conditionals 0–3", "Mixed Conditionals", "Nominalisation", "Academic Core"].includes(f),
      ) ||
        estimation.limitingFactors.some((f) => f.includes("grammar") || f.includes("CEFR")),
    )
  })
})

describe("IELTS recommendation engine", () => {
  it("suggests next band target and missing topics", () => {
    const estimation = {
      estimatedBand: 6.0,
      confidence: 75,
      cefrProfile: { A1: 90, A2: 85, B1: 70, B2: 55, C1: 20, C2: 0 },
      limitingFactors: ["Conditionals 0–3"],
      potentialBand: 6.5,
    }
    const topicMasteries = [
      { topicId: "conditionals", masteryScore: 55, cefrLevel: "B2", category: "grammar", attemptedQuestions: 10 },
      { topicId: "passive-voice", masteryScore: 72, cefrLevel: "B2", category: "grammar", attemptedQuestions: 20 },
    ]

    const rec = buildIeltsRecommendations(estimation, topicMasteries)
    assert.equal(rec.nextBandTarget, 6.5)
    assert.ok(rec.recommendedTopics.length > 0)
    assert.ok(rec.estimatedStudyHours > 0)
    assert.ok(rec.explanation.includes("Band"))
  })
})

describe("stability component", () => {
  it("rewards consistent attempt accuracy", () => {
    const stable = topicInternal.computeStability([
      { correct: 8, total: 10 },
      { correct: 9, total: 10 },
      { correct: 8, total: 10 },
    ])
    const volatile = topicInternal.computeStability([
      { correct: 10, total: 10 },
      { correct: 2, total: 10 },
      { correct: 9, total: 10 },
    ])
    assert.ok(stable > volatile)
  })
})
