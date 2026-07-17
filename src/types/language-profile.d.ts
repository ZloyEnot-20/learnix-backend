/**
 * TypeScript interfaces for Learnix Language Profile / IELTS Estimation.
 * Backend is JS — these types document the API contract for frontends.
 */

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
export type MasteryStatus = "mastered" | "partial" | "not_mastered"
export type TopicCategory = "grammar" | "vocabulary" | "academic_vocabulary"

export interface TopicCatalogueEntry {
  id: string
  name: string
  level: CefrLevel
  minBand: number
  ceilingBand: number
  weight: number
  category: TopicCategory
  isCritical?: boolean
}

export interface StudentTopicMastery {
  studentId: string
  orgId: string
  topicId: string
  category: TopicCategory
  cefrLevel: CefrLevel
  masteryScore: number
  confidenceScore: number
  attempts: number
  attemptedQuestions: number
  weightedAccuracy: number
  masteryStatus: MasteryStatus
  lastPracticedAt: string | null
  lastComputedAt: string
}

export type CefrProfile = Record<CefrLevel, number>

export interface IeltsEstimation {
  estimatedBand: number
  potentialBand: number
  confidence: number
  strengths: string[]
  weaknesses: string[]
  limitingFactors: string[]
  componentBands: {
    grammar: number | null
    vocabulary: number | null
    academicVocabulary: number | null
    reading: number | null
    listening: number | null
    writing: number | null
    speaking: number | null
  }
}

export interface IeltsRecommendation {
  nextBandTarget: number
  missingTopics: Array<{
    topicId: string
    name: string
    level: string
    masteryScore: number
    category?: string
  }>
  recommendedTopics: Array<{
    topicId: string
    name: string
    level: string
    masteryScore: number
    expectedBandUplift?: number
    category?: string
  }>
  estimatedStudyHours: number
  explanation: string
}

export interface IeltsEstimationResponse {
  studentId: string
  cefrProfile: CefrProfile
  grammarCefrProfile: CefrProfile
  vocabularyCefrProfile: CefrProfile
  ieltsEstimation: IeltsEstimation
  ieltsRecommendation: IeltsRecommendation
  lastComputedAt: string
}
