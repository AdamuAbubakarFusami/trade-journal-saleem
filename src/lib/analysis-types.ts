export type ScoreItem = { name: string; score: number; comment: string };
export type Detected = { title: string; explanation: string };

export type TradeAnalysis = {
  insufficientData: boolean;
  summary: string;
  grade: { label: string; reason: string };
  executionScores: ScoreItem[];
  psychology: { assessment: string; factors: Detected[] };
  mistakes: Detected[];
  strengths: Detected[];
  performanceInsights: Detected[];
  patterns: Detected[];
  riskAnalysis: { assessment: string; recommendations: Detected[] };
  psychologyCoach: string[];
  recommendations: Detected[];
  confidence: { percent: number; reason: string };
  checklist: string[];
};

export type PeriodReport = {
  insufficientData: boolean;
  summary: string;
  metrics: { label: string; value: string }[];
  bestStrategy: Detected | null;
  worstStrategy: Detected | null;
  bestSession: Detected | null;
  worstSession: Detected | null;
  topMistake: Detected | null;
  psychologyTrend: string;
  overallGrade: { label: string; reason: string };
  recommendations: Detected[];
};

export type TraderProfile = {
  insufficientData: boolean;
  archetype: string;
  reason: string;
  traits: Detected[];
  growth: Detected[];
  focusNext: Detected[];
};

export const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
