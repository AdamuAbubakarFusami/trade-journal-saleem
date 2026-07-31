import type { Trade } from "./trades";
import { computeStats } from "./trades";

const nums = (trades: Trade[], pick: (t: Trade) => unknown) =>
  trades.map((t) => Number(pick(t))).filter((n) => Number.isFinite(n));

const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

const stdev = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v)!;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

const share = (trades: Trade[], tag: string) =>
  trades.length
    ? (trades.filter((t) => (t.emotional_state ?? "").toLowerCase() === tag).length / trades.length) * 10
    : null;

export type PsychMeter = {
  key: string;
  label: string;
  value: number | null;
  invert: boolean;
  hint: string;
};

/** All psychology meters, derived only from logged journal fields. */
export function psychMeters(trades: Trade[]): PsychMeter[] {
  const fear = mean(nums(trades, (t) => t.fear_level));
  const greed = mean(nums(trades, (t) => t.greed_level));
  const confidence = mean(nums(trades, (t) => t.confidence_level));
  const discipline = mean(nums(trades, (t) => t.discipline_level));
  const patience = mean(nums(trades, (t) => t.patience_level));
  const fomo = share(trades, "fomo");
  const revenge = share(trades, "revenge");
  const stress = fear !== null && greed !== null ? (fear + greed) / 2 : fear ?? greed;

  const losses = computeStats(trades);
  const recent = [...trades]
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, 20);
  const recentLossRate = recent.length
    ? recent.filter((t) => Number(t.profit_loss) < 0).length / recent.length
    : 0;
  const burnout =
    trades.length < 5
      ? null
      : Math.min(
          10,
          recentLossRate * 6 + (stress ?? 5) * 0.3 + (losses.streak < -2 ? 2 : 0),
        );

  const emotionSpread = stdev([
    ...nums(trades, (t) => t.fear_level),
    ...nums(trades, (t) => t.greed_level),
  ]);
  const stability = trades.length < 3 ? null : Math.max(0, 10 - emotionSpread * 2.2);

  return [
    { key: "fear", label: "Fear gauge", value: fear, invert: true, hint: "Average logged fear on entry" },
    { key: "greed", label: "Greed gauge", value: greed, invert: true, hint: "Average logged greed on entry" },
    { key: "confidence", label: "Confidence meter", value: confidence, invert: false, hint: "Average conviction level" },
    { key: "discipline", label: "Discipline meter", value: discipline, invert: false, hint: "Rule-following self-rating" },
    { key: "patience", label: "Patience meter", value: patience, invert: false, hint: "Waiting for the setup" },
    { key: "fomo", label: "FOMO meter", value: fomo, invert: true, hint: "Share of trades tagged FOMO" },
    { key: "revenge", label: "Revenge trading meter", value: revenge, invert: true, hint: "Share of trades tagged revenge" },
    { key: "stress", label: "Stress meter", value: stress, invert: true, hint: "Combined fear and greed load" },
    { key: "burnout", label: "Burnout risk", value: burnout, invert: true, hint: "Recent loss rate, streak and stress" },
    { key: "stability", label: "Emotional stability", value: stability, invert: false, hint: "How steady your emotional inputs are" },
  ];
}
