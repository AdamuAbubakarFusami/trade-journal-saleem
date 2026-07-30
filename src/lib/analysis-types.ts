export type ScoreItem = { name: string; score: number; comment: string };
export type Detected = { title: string; explanation: string };

export type Confidence = {
  percent: number;
  reason: string;
  dataSufficiency?: string;
  sampleSize?: number;
};

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
  capitalPreservation?: { assessment: string; points: Detected[] };
  behavioral?: { assessment: string; points: Detected[] };
  psychologyCoach: string[];
  recommendations: Detected[];
  confidence: Confidence;
  checklist: string[];
};

export type PeriodKey = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export type PeriodReport = {
  insufficientData: boolean;
  summary: string;
  metrics: { label: string; value: string }[];
  biggestImprovement?: Detected | null;
  biggestWeakness?: Detected | null;
  bestStrategy: Detected | null;
  worstStrategy: Detected | null;
  bestSession: Detected | null;
  worstSession: Detected | null;
  topMistake: Detected | null;
  psychologyTrend: string;
  riskTrend?: string;
  consistencyScore?: number | null;
  disciplineScore?: number | null;
  overallGrade: { label: string; reason: string };
  recommendations: Detected[];
  confidence?: Confidence;
};

export type TraderProfile = {
  insufficientData: boolean;
  archetype: string;
  reason: string;
  traits: Detected[];
  growth: Detected[];
  focusNext: Detected[];
  confidence?: Confidence;
};

export type AnalyzerReport = {
  insufficientData: boolean;
  headline: string;
  summary: string;
  findings: Detected[];
  recommendations: Detected[];
  confidence?: Confidence;
};

export type AnalyzerKind =
  | "strategy"
  | "session"
  | "emotion"
  | "risk"
  | "performance"
  | "consistency"
  | "discipline"
  | "habit";

export const ANALYZERS: { key: AnalyzerKind; label: string; blurb: string }[] = [
  { key: "strategy", label: "Strategy analyzer", blurb: "Which setups carry your edge and which drain it." },
  { key: "session", label: "Session analyzer", blurb: "How Asia, London, New York and overlaps compare." },
  { key: "emotion", label: "Emotion analyzer", blurb: "How each logged emotional state maps to results." },
  { key: "risk", label: "Risk analyzer", blurb: "Risk sizing, drawdown, exposure and capital preservation." },
  { key: "performance", label: "Performance analyzer", blurb: "Expectancy, profit factor, Sharpe and Sortino read." },
  { key: "consistency", label: "Consistency analyzer", blurb: "How repeatable your process is across trades." },
  { key: "discipline", label: "Discipline analyzer", blurb: "Rule-following versus deviation, with evidence." },
  { key: "habit", label: "Habit analyzer", blurb: "Recurring behaviours by day, time and sequence." },
];

export const GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
