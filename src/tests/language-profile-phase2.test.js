import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { speakingConfidenceFromAssessments } from "../config/language-profile.js"
import {
  shouldSaveSnapshot,
  SNAPSHOT_SCORE_THRESHOLD,
  SNAPSHOT_MIN_DAYS,
} from "../services/languageProfileSnapshot.service.js"
import { buildRecommendations } from "../services/studentRecommendations.service.js"
import { _internal } from "../services/studentLanguageProfile.service.js"

const {
  computeOverallSkillScores,
  computeLevelCoverage,
  countApprovedSpeakingAssessments,
  speakingConfidenceFromAssessments: speakingConf,
} = _internal

describe("language-profile snapshots", () => {
  const baseProfile = {
    grammar: { score: 620, level: 5 },
    vocabulary: { score: 580, level: 4 },
    speaking: { score: 650, level: 5 },
    overall: { score: 610, level: 5 },
  }

  it("saves first snapshot when none exists", () => {
    assert.equal(shouldSaveSnapshot(null, baseProfile), true)
  })

  it("saves when any score changes by more than threshold", () => {
    const prev = {
      createdAt: new Date(),
      grammarScore: 620,
      vocabularyScore: 580,
      speakingScore: 650,
      overallScore: 610,
    }
    const changed = {
      ...baseProfile,
      grammar: { score: 620 + SNAPSHOT_SCORE_THRESHOLD + 1, level: 5 },
    }
    assert.equal(shouldSaveSnapshot(prev, changed), true)
  })

  it("does not save when scores stable within threshold", () => {
    const prev = {
      createdAt: new Date(),
      grammarScore: 620,
      vocabularyScore: 580,
      speakingScore: 650,
      overallScore: 610,
    }
    const similar = {
      ...baseProfile,
      grammar: { score: 622, level: 5 },
    }
    assert.equal(shouldSaveSnapshot(prev, similar), false)
  })

  it("saves after minimum days elapsed", () => {
    const prev = {
      createdAt: new Date(Date.now() - (SNAPSHOT_MIN_DAYS + 1) * 24 * 60 * 60 * 1000),
      grammarScore: 620,
      vocabularyScore: 580,
      speakingScore: 650,
      overallScore: 610,
    }
    assert.equal(shouldSaveSnapshot(prev, baseProfile), true)
  })
})

describe("speaking confidence", () => {
  it("uses assessment count not question count", () => {
    assert.equal(speakingConfidenceFromAssessments(1), 0.1)
    assert.equal(speakingConfidenceFromAssessments(5), 0.5)
    assert.equal(speakingConfidenceFromAssessments(10), 1)
    assert.equal(speakingConfidenceFromAssessments(15), 1)
  })

  it("counts graded speaking submissions", () => {
    const subs = [
      {
        subject: "speaking",
        status: "graded",
        score: 7,
        attempt: { mistakes: [{ score: 7 }] },
      },
      {
        subject: "speaking",
        status: "submitted",
        attempt: { mistakes: [] },
      },
      {
        subject: "grammar",
        status: "graded",
        score: 8,
      },
    ]
    assert.equal(countApprovedSpeakingAssessments(subs), 1)
  })

  it("counts rubric-graded speaking", () => {
    const subs = [
      {
        subject: "speaking",
        status: "graded",
        attempt: {
          mistakes: [{ grammarScore: 8, fluencyScore: 6, vocabularyScore: 7, pronunciationScore: 8 }],
        },
      },
    ]
    assert.equal(countApprovedSpeakingAssessments(subs), 1)
    assert.equal(speakingConf(1), 0.1)
  })
})

describe("confidence-weighted overall score", () => {
  it("down-weights low-confidence speaking", () => {
    const overall = computeOverallSkillScores({
      grammar: { score: 620, confidence: 0.95, hasData: true, topics: [] },
      vocabulary: { score: 580, confidence: 0.9, hasData: true, topics: [] },
      speaking: { score: 650, confidence: 0.2, hasData: true, topics: [] },
    })
    // Without weighting avg would be ~616; with weighting speaking matters less
    assert.ok(overall.score < 616)
    assert.ok(overall.score > 590)
    assert.ok(Math.abs(overall.score - 601) <= 5)
  })

  it("excludes skills with zero confidence", () => {
    const overall = computeOverallSkillScores({
      grammar: { score: 620, confidence: 0.8, hasData: true, topics: [] },
      vocabulary: { score: 580, confidence: 0.7, hasData: true, topics: [] },
      speaking: { score: 650, confidence: 0, hasData: false, topics: [] },
    })
    assert.ok(overall.score > 580 && overall.score < 620)
  })
})

describe("level coverage", () => {
  it("computes percent mastered per learnix level against catalogue", () => {
    const grammarTopics = [
      { slug: "verb-to-be", mastered: true, learnixLevel: 1 },
      { slug: "there-is-there-are", mastered: false, learnixLevel: 1 },
      { slug: "present-simple", mastered: true, learnixLevel: 2 },
      { slug: "pronouns", mastered: false, learnixLevel: 2 },
    ]
    const coverage = computeLevelCoverage(grammarTopics, [])
    // Level 1 catalogue: verb-to-be, there-is-there-are, verb-to-have (3 topics)
    assert.equal(coverage["1"], 33)
    // Level 2 catalogue: 4 topics, 1 mastered
    assert.equal(coverage["2"], 25)
  })

  it("returns 100 when all catalogue topics at level mastered", () => {
    const grammarTopics = [
      { slug: "verb-to-be", mastered: true, learnixLevel: 1 },
      { slug: "there-is-there-are", mastered: true, learnixLevel: 1 },
      { slug: "verb-to-have", mastered: true, learnixLevel: 1 },
    ]
    const coverage = computeLevelCoverage(grammarTopics, [])
    assert.equal(coverage["1"], 100)
  })
})

describe("recommendation engine", () => {
  const profile = {
    grammar: {
      hasData: true,
      score: 500,
      topics: [
        {
          slug: "conditionals",
          title: "Conditionals",
          needsReview: true,
          mastered: false,
          weightedAccuracy: 45,
          confidence: 0.8,
          attemptedQuestions: 20,
        },
        {
          slug: "reported-speech",
          title: "Reported Speech",
          needsReview: true,
          mastered: false,
          weightedAccuracy: 58,
          confidence: 0.75,
          attemptedQuestions: 18,
        },
      ],
    },
    vocabulary: {
      hasData: true,
      score: 400,
      topics: [
        {
          slug: "family-a1",
          title: "Family",
          needsReview: false,
          mastered: false,
          weightedAccuracy: 70,
          confidence: 0.3,
          attemptedQuestions: 10,
        },
      ],
    },
    speaking: {
      hasData: true,
      score: 500,
      dimensions: { grammar: 600, vocabulary: 550, fluency: 400, pronunciation: 580 },
    },
  }

  it("returns at most 5 recommendations", () => {
    const recs = buildRecommendations(profile)
    assert.ok(recs.length <= 5)
  })

  it("prioritizes high before medium", () => {
    const recs = buildRecommendations(profile)
    const highs = recs.filter((r) => r.priority === "high")
    const mediums = recs.filter((r) => r.priority === "medium")
    if (highs.length && mediums.length) {
      assert.ok(recs.indexOf(highs[0]) < recs.indexOf(mediums[0]))
    }
  })

  it("includes review_topic for weak grammar topics", () => {
    const recs = buildRecommendations(profile)
    const conditionals = recs.find((r) => r.topic === "conditionals")
    assert.ok(conditionals)
    assert.equal(conditionals.type, "review_topic")
    assert.equal(conditionals.priority, "high")
  })

  it("includes improve_fluency when dimension is low", () => {
    const recs = buildRecommendations(profile)
    assert.ok(recs.some((r) => r.type === "improve_fluency"))
  })

  it("includes increase_vocabulary when score is low", () => {
    const recs = buildRecommendations(profile)
    assert.ok(recs.some((r) => r.type === "increase_vocabulary"))
  })
})
