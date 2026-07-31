import { consistencyScore, disciplineScore, maxDrawdownValue } from "./quant";
import { detectMistakes } from "./rules-engine";
import { computeStats, groupBy, type Trade } from "./trades";

export type ScoreBreakdown = {
  key: string;
  label: string;
  value: number | null;
  hint: string;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

const nums = (trades: Trade[], pick: (t: Trade) => unknown) =>
  trades.map((t) => Number(pick(t))).filter((n) => Number.isFinite(n));

/** Risk score: stop-loss coverage, sizing inside 2%, drawdown vs net result. */
export function riskScore(trades: Trade[]): number | null {
  if (!trades.length) return null;
  const withStop = trades.filter((t) => t.stop_loss).length / trades.length;
  const risks = nums(trades, (t) => t.risk_percent);
  const sized = risks.length ? risks.filter((r) => r <= 2).length / risks.length : 0.5;
  const net = computeStats(trades).netPnl;
  const dd = Math.abs(maxDrawdownValue(trades));
  const recovery = dd ? Math.max(0, Math.min(1, net / dd)) : net >= 0 ? 1 : 0;
  return clamp(withStop * 45 + sized * 35 + recovery * 20);
}

/** Execution score: RR quality, win rate and profit factor. */
export function executionScore(trades: Trade[]): number | null {
  if (!trades.length) return null;
  const s = computeStats(trades);
  const rr = Math.min(1, (s.avgRr || 0) / 2.5);
  const wr = Math.min(1, s.winRate / 60);
  const pf = Number.isFinite(s.profitFactor) ? Math.min(1, s.profitFactor / 2) : 1;
  return clamp(rr * 35 + wr * 30 + pf * 35);
}

/** Psychology score: calm (inverse fear/greed), patience and confidence balance. */
export function psychologyScore(trades: Trade[]): number | null {
  const fear = avg(nums(trades, (t) => t.fear_level));
  const greed = avg(nums(trades, (t) => t.greed_level));
  const patience = avg(nums(trades, (t) => t.patience_level));
  const confidence = avg(nums(trades, (t) => t.confidence_level));
  const parts = [
    fear === null ? null : (10 - fear) * 10,
    greed === null ? null : (10 - greed) * 10,
    patience === null ? null : patience * 10,
    confidence === null ? null : Math.min(100, confidence * 10),
  ].filter((n): n is number => n !== null);
  return parts.length ? clamp(avg(parts)!) : null;
}

/** RR score: how much of the journal sits at 2R or better. */
export function rrScore(trades: Trade[]): number | null {
  const rr = nums(trades, (t) => t.rr_ratio).filter((v) => v > 0);
  if (!rr.length) return null;
  const good = rr.filter((v) => v >= 2).length / rr.length;
  const mean = avg(rr)!;
  return clamp(good * 55 + Math.min(1, mean / 3) * 45);
}

export type AiScore = {
  overall: number | null;
  breakdown: ScoreBreakdown[];
  sampleSize: number;
};

export function aiScore(trades: Trade[]): AiScore {
  const breakdown: ScoreBreakdown[] = [
    {
      key: "risk",
      label: "Risk",
      value: riskScore(trades),
      hint: "Stops, sizing, drawdown control",
    },
    {
      key: "discipline",
      label: "Discipline",
      value: disciplineScore(trades),
      hint: "Logged discipline levels",
    },
    {
      key: "execution",
      label: "Execution",
      value: executionScore(trades),
      hint: "RR, win rate, profit factor",
    },
    {
      key: "psychology",
      label: "Psychology",
      value: psychologyScore(trades),
      hint: "Fear, greed, patience, confidence",
    },
    {
      key: "consistency",
      label: "Consistency",
      value: consistencyScore(trades),
      hint: "Spread of risk and results",
    },
    { key: "rr", label: "Risk / reward", value: rrScore(trades), hint: "Share of 2R+ trades" },
  ];
  const values = breakdown.map((b) => b.value).filter((v): v is number => v !== null);
  return {
    overall: values.length ? clamp(avg(values)!) : null,
    breakdown,
    sampleSize: trades.length,
  };
}

export const withinDaysLocal = (trades: Trade[], days: number) => {
  const cutoff = Date.now() - days * 86400000;
  return trades.filter((t) => new Date(t.opened_at).getTime() >= cutoff);
};

/** Score for a rolling window — used for the Today / Week / Month AI scores. */
export function periodScore(trades: Trade[], days: number) {
  const slice = withinDaysLocal(trades, days);
  return { score: aiScore(slice).overall, trades: slice.length };
}

export type Widget = {
  label: string;
  value: string;
  hint: string;
  tone: "good" | "bad" | "neutral";
};

/** Deterministic dashboard widgets — every value comes straight from the journal. */
export function dashboardWidgets(trades: Trade[]): Widget[] {
  const strategies = groupBy(trades, (t) => t.strategy);
  const sessions = groupBy(trades, (t) => t.session);
  const emotions = groupBy(trades, (t) => t.emotional_state);

  const mistakeCounts = new Map<string, number>();
  for (const t of trades)
    for (const m of detectMistakes(t, trades))
      mistakeCounts.set(m.title, (mistakeCounts.get(m.title) ?? 0) + 1);
  const topMistake = [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const mostEmotional = [...emotions].sort((a, b) => a.pnl - b.pnl)[0];

  const half = Math.floor(trades.length / 2);
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
  );
  const first = sortedTrades.slice(0, half);
  const second = sortedTrades.slice(half);

  const delta = (fn: (t: Trade[]) => number | null) => {
    const a = fn(first);
    const b = fn(second);
    if (a === null || b === null) return null;
    return Math.round(b - a);
  };

  const trend = (label: string, hint: string, d: number | null): Widget => ({
    label,
    hint,
    value: d === null ? "—" : `${d > 0 ? "+" : ""}${d} pts`,
    tone: d === null ? "neutral" : d > 0 ? "good" : d < 0 ? "bad" : "neutral",
  });

  return [
    {
      label: "Best strategy",
      value: strategies[0]?.name ?? "—",
      hint: strategies[0]
        ? `${strategies[0].trades} trades · ${strategies[0].pnl >= 0 ? "+" : ""}${strategies[0].pnl}`
        : "No strategy logged",
      tone: strategies[0] && strategies[0].pnl > 0 ? "good" : "neutral",
    },
    {
      label: "Worst strategy",
      value: strategies.length > 1 ? strategies[strategies.length - 1].name : "—",
      hint:
        strategies.length > 1
          ? `${strategies[strategies.length - 1].trades} trades · ${strategies[strategies.length - 1].pnl}`
          : "Needs more strategies logged",
      tone: strategies.length > 1 && strategies[strategies.length - 1].pnl < 0 ? "bad" : "neutral",
    },
    {
      label: "Most profitable session",
      value: sessions[0]?.name ?? "—",
      hint: sessions[0]
        ? `${sessions[0].trades} trades · win rate ${sessions[0].winRate.toFixed(0)}%`
        : "No sessions logged",
      tone: sessions[0] && sessions[0].pnl > 0 ? "good" : "neutral",
    },
    {
      label: "Most emotional state",
      value: mostEmotional?.name ?? "—",
      hint: mostEmotional
        ? `${mostEmotional.trades} trades · ${mostEmotional.pnl}`
        : "No emotions logged",
      tone: mostEmotional && mostEmotional.pnl < 0 ? "bad" : "neutral",
    },
    {
      label: "Most common mistake",
      value: topMistake?.[0] ?? "None detected",
      hint: topMistake
        ? `Flagged on ${topMistake[1]} trades`
        : "Rule engine found no repeated flags",
      tone: topMistake ? "bad" : "good",
    },
    trend("Consistency trend", "Second half vs first half", delta(consistencyScore)),
    trend("Psychology trend", "Second half vs first half", delta(psychologyScore)),
    trend("Risk trend", "Second half vs first half", delta(riskScore)),
    trend("Discipline trend", "Second half vs first half", delta(disciplineScore)),
  ];
}
