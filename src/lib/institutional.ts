/**
 * Institutional analytics engine — every number here is derived deterministically
 * from the trader's own completed journal rows. Nothing is fabricated, nothing is
 * predicted about the market itself; the projections are resamplings of the
 * trader's own realised outcomes.
 */
import { computeStats, groupBy, type Trade } from "./trades";
import { drawdownCurve, maxDrawdownValue, streaks } from "./quant";

export const MIN_TRADES = 5;
export const NOT_ENOUGH = "Not enough trading data yet.";

const r2 = (n: number) => Number(n.toFixed(2));
const pl = (t: Trade) => Number(t.profit_loss || 0);
const asc = (trades: Trade[]) =>
  [...trades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

export const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

export function stdev(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

export function percentile(sortedValues: number[], p: number) {
  if (!sortedValues.length) return 0;
  const idx = (sortedValues.length - 1) * (p / 100);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

export function durationHours(t: Trade) {
  if (!t.closed_at) return null;
  const h = (new Date(t.closed_at).getTime() - new Date(t.opened_at).getTime()) / 3600000;
  return Number.isFinite(h) && h >= 0 ? h : null;
}

/** Estimated account capital, inferred from average loss and average risk %. */
export function estimatedCapital(trades: Trade[]) {
  const risks = trades.map((t) => Number(t.risk_percent)).filter((v) => Number.isFinite(v) && v > 0);
  const losses = trades.map(pl).filter((v) => v < 0).map(Math.abs);
  if (risks.length >= 3 && losses.length >= 3) {
    const est = mean(losses) / (mean(risks) / 100);
    if (Number.isFinite(est) && est > 0) return Math.round(est);
  }
  return 10000;
}

/* ------------------------------------------------------------------ */
/* 1. Quant statistics                                                 */
/* ------------------------------------------------------------------ */

export type Rating = "excellent" | "good" | "average" | "poor" | "neutral";

export type QuantMetric = {
  key: string;
  label: string;
  value: number | null;
  display: string;
  rating: Rating;
  ratingLabel: string;
  formula: string;
  plain: string;
  interpretation: string;
};

const fmtNum = (v: number | null, digits = 2) => (v === null ? "—" : v.toFixed(digits));
const fmtMoney = (v: number | null) =>
  v === null
    ? "—"
    : `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtPct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

function band(
  value: number | null,
  thresholds: [number, number, number],
  labels: [string, string, string, string] = ["Excellent", "Good", "Average", "Poor"],
): { rating: Rating; ratingLabel: string } {
  if (value === null || !Number.isFinite(value)) return { rating: "neutral", ratingLabel: "No data" };
  if (value >= thresholds[0]) return { rating: "excellent", ratingLabel: labels[0] };
  if (value >= thresholds[1]) return { rating: "good", ratingLabel: labels[1] };
  if (value >= thresholds[2]) return { rating: "average", ratingLabel: labels[2] };
  return { rating: "poor", ratingLabel: labels[3] };
}

export function sharpe(trades: Trade[]) {
  const v = trades.map(pl);
  const sd = stdev(v);
  return sd ? r2(mean(v) / sd) : null;
}

export function sortino(trades: Trade[]) {
  const v = trades.map(pl);
  const down = v.filter((x) => x < 0);
  if (!v.length || !down.length) return null;
  const dd = Math.sqrt(down.reduce((s, x) => s + x ** 2, 0) / down.length);
  return dd ? r2(mean(v) / dd) : null;
}

/** Omega = sum of gains above zero divided by the absolute sum of losses. */
export function omega(trades: Trade[]) {
  const gains = trades.map(pl).filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const losses = Math.abs(trades.map(pl).filter((v) => v < 0).reduce((s, v) => s + v, 0));
  return losses ? r2(gains / losses) : gains > 0 ? null : null;
}

export function kelly(trades: Trade[]) {
  const s = computeStats(trades);
  if (!s.avgLoss || !s.total) return null;
  const w = s.winRate / 100;
  const b = s.avgWin / s.avgLoss;
  if (!b) return null;
  return r2((w - (1 - w) / b) * 100);
}

export function sqn(trades: Trade[]) {
  const v = trades.map(pl);
  const sd = stdev(v);
  if (!sd || v.length < 2) return null;
  return r2((mean(v) / sd) * Math.sqrt(v.length));
}

/** Edge ratio: average win divided by average loss (payoff ratio). */
export function edgeRatio(trades: Trade[]) {
  const s = computeStats(trades);
  return s.avgLoss ? r2(s.avgWin / s.avgLoss) : null;
}

/** Annualised return over max drawdown, using the journal's own date span. */
export function calmar(trades: Trade[]) {
  const dd = Math.abs(maxDrawdownValue(trades));
  if (!dd) return null;
  const list = asc(trades);
  if (list.length < 2) return null;
  const years =
    (new Date(list[list.length - 1].opened_at).getTime() - new Date(list[0].opened_at).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  const net = computeStats(trades).netPnl;
  if (years <= 0.02) return r2(net / dd);
  return r2(net / years / dd);
}

export function recoveryFactorValue(trades: Trade[]) {
  const dd = Math.abs(maxDrawdownValue(trades));
  return dd ? r2(computeStats(trades).netPnl / dd) : null;
}

export function expectancy(trades: Trade[]) {
  if (!trades.length) return null;
  const s = computeStats(trades);
  const w = s.winRate / 100;
  return r2(w * s.avgWin - (1 - w) * s.avgLoss);
}

export function quantStatistics(trades: Trade[]): QuantMetric[] {
  const s = computeStats(trades);
  const st = streaks(trades);
  const durations = trades.map(durationHours).filter((h): h is number => h !== null);
  const risks = trades.map((t) => Number(t.risk_percent)).filter(Number.isFinite);
  const sizes = trades.map((t) => Number(t.position_size)).filter(Number.isFinite);
  const sh = sharpe(trades);
  const so = sortino(trades);
  const ca = calmar(trades);
  const om = omega(trades);
  const ke = kelly(trades);
  const rf = recoveryFactorValue(trades);
  const ex = expectancy(trades);
  const ed = edgeRatio(trades);
  const sq = sqn(trades);
  const pf = Number.isFinite(s.profitFactor) ? r2(s.profitFactor) : null;

  const m = (
    key: string,
    label: string,
    value: number | null,
    display: string,
    rated: { rating: Rating; ratingLabel: string },
    formula: string,
    plain: string,
    interpretation: string,
  ): QuantMetric => ({ key, label, value, display, ...rated, formula, plain, interpretation });

  const n = trades.length;
  const sample = `Computed from ${n} completed journal ${n === 1 ? "trade" : "trades"}.`;

  return [
    m(
      "sharpe",
      "Sharpe Ratio",
      sh,
      fmtNum(sh),
      band(sh, [2, 1, 0.5]),
      "mean(P/L per trade) ÷ standard deviation(P/L per trade)",
      "Measures return relative to volatility of your results.",
      sh === null
        ? NOT_ENOUGH
        : `A per-trade Sharpe of ${sh} means your average result is ${sh} times the size of your result volatility. ${sample}`,
    ),
    m(
      "sortino",
      "Sortino Ratio",
      so,
      fmtNum(so),
      band(so, [2, 1, 0.5]),
      "mean(P/L) ÷ downside deviation(losing trades only)",
      "Like Sharpe, but only penalises downside volatility.",
      so === null
        ? NOT_ENOUGH
        : `Your downside-adjusted return is ${so}. Values above 1 mean gains outweigh the size of your losing swings. ${sample}`,
    ),
    m(
      "calmar",
      "Calmar Ratio",
      ca,
      fmtNum(ca),
      band(ca, [3, 1, 0.5]),
      "annualised net P/L ÷ |maximum drawdown|",
      "How much you earn per unit of worst peak-to-trough loss.",
      ca === null
        ? NOT_ENOUGH
        : `You produce ${ca} units of annualised profit for every unit of maximum drawdown (${fmtMoney(maxDrawdownValue(trades))}).`,
    ),
    m(
      "omega",
      "Omega Ratio",
      om,
      fmtNum(om),
      band(om, [1.75, 1.25, 1]),
      "sum(gains) ÷ |sum(losses)|",
      "The total upside captured for every unit of downside taken.",
      om === null
        ? NOT_ENOUGH
        : `For every $1 lost, your journal shows $${om} gained across ${n} trades.`,
    ),
    m(
      "kelly",
      "Kelly Criterion",
      ke,
      ke === null ? "—" : `${ke.toFixed(1)}%`,
      band(ke, [20, 10, 2]),
      "win% − (loss% ÷ payoff ratio)",
      "The theoretical fraction of capital your edge justifies risking.",
      ke === null
        ? NOT_ENOUGH
        : ke <= 0
          ? `Kelly is ${ke.toFixed(1)}% — your current win rate (${s.winRate.toFixed(1)}%) and payoff (${fmtNum(ed)}) do not yet show a positive edge.`
          : `Full Kelly is ${ke.toFixed(1)}%. Professionals typically risk a quarter to a half of that — roughly ${(ke / 4).toFixed(1)}%–${(ke / 2).toFixed(1)}% per trade.`,
    ),
    m(
      "recovery",
      "Recovery Factor",
      rf,
      fmtNum(rf),
      band(rf, [3, 1.5, 0.5]),
      "net P/L ÷ |maximum drawdown|",
      "How efficiently you recover the capital you draw down.",
      rf === null
        ? NOT_ENOUGH
        : `You have recovered ${fmtNum(rf)}× your worst drawdown of ${fmtMoney(maxDrawdownValue(trades))}.`,
    ),
    m(
      "expectancy",
      "Profit Expectancy",
      ex,
      fmtMoney(ex),
      band(ex, [50, 10, 0]),
      "(win% × average win) − (loss% × average loss)",
      "The average amount your process makes per trade.",
      ex === null
        ? NOT_ENOUGH
        : `Each trade is worth ${fmtMoney(ex)} on average given a ${s.winRate.toFixed(1)}% win rate, ${fmtMoney(s.avgWin)} average win and ${fmtMoney(s.avgLoss)} average loss.`,
    ),
    m(
      "edge",
      "Edge Ratio",
      ed,
      fmtNum(ed),
      band(ed, [2, 1.5, 1]),
      "average win ÷ average loss",
      "How much bigger your winners are than your losers.",
      ed === null
        ? NOT_ENOUGH
        : `Your winners are ${fmtNum(ed)}× your losers (${fmtMoney(s.avgWin)} vs ${fmtMoney(s.avgLoss)}).`,
    ),
    m(
      "mar",
      "MAR Ratio",
      ca,
      fmtNum(ca),
      band(ca, [1, 0.5, 0.25]),
      "annualised return ÷ |maximum drawdown|",
      "Industry benchmark of return per unit of pain; MAR uses the same construction as Calmar.",
      ca === null
        ? NOT_ENOUGH
        : `MAR of ${fmtNum(ca)}. Hedge funds usually consider values above 0.5 institutional quality.`,
    ),
    m(
      "sqn",
      "System Quality Number",
      sq,
      fmtNum(sq),
      band(sq, [3, 2, 1]),
      "(mean P/L ÷ standard deviation P/L) × √(number of trades)",
      "Van Tharp's measure of system quality, scaled by sample size.",
      sq === null
        ? NOT_ENOUGH
        : `SQN of ${fmtNum(sq)} across ${n} trades. Above 2 is generally considered a good tradable system; below 1 suggests the edge is not yet proven.`,
    ),
    m(
      "avgWin",
      "Average Win",
      s.wins ? r2(s.avgWin) : null,
      s.wins ? fmtMoney(r2(s.avgWin)) : "—",
      { rating: "neutral", ratingLabel: `${s.wins} winners` },
      "sum(winning P/L) ÷ number of winning trades",
      "Typical size of your profitable trades.",
      s.wins ? `${s.wins} winners average ${fmtMoney(r2(s.avgWin))}.` : NOT_ENOUGH,
    ),
    m(
      "avgLoss",
      "Average Loss",
      s.losses ? r2(s.avgLoss) : null,
      s.losses ? fmtMoney(r2(s.avgLoss)) : "—",
      { rating: "neutral", ratingLabel: `${s.losses} losers` },
      "|sum(losing P/L)| ÷ number of losing trades",
      "Typical size of your losing trades.",
      s.losses ? `${s.losses} losers average ${fmtMoney(r2(s.avgLoss))}.` : NOT_ENOUGH,
    ),
    m(
      "profitFactor",
      "Profit Factor",
      pf,
      fmtNum(pf),
      band(pf, [2, 1.5, 1]),
      "gross profit ÷ gross loss",
      "Dollars won for every dollar lost.",
      pf === null
        ? NOT_ENOUGH
        : `Profit factor of ${fmtNum(pf)} — above 1.5 is typically a durable edge, below 1 means the system loses money.`,
    ),
    m(
      "winRate",
      "Win Rate",
      r2(s.winRate),
      fmtPct(s.winRate),
      band(s.winRate, [60, 45, 35]),
      "winning trades ÷ total trades × 100",
      "Share of trades closed in profit.",
      n ? `${s.wins} of ${n} trades closed green (${fmtPct(s.winRate)}).` : NOT_ENOUGH,
    ),
    m(
      "lossRate",
      "Loss Rate",
      r2(s.lossRate),
      fmtPct(s.lossRate),
      { rating: "neutral", ratingLabel: `${s.losses} losing trades` },
      "losing trades ÷ total trades × 100",
      "Share of trades closed at a loss.",
      n ? `${s.losses} of ${n} trades closed red (${fmtPct(s.lossRate)}).` : NOT_ENOUGH,
    ),
    m(
      "avgRr",
      "Average RR",
      r2(s.avgRr),
      s.avgRr ? `${s.avgRr.toFixed(2)}R` : "—",
      band(s.avgRr, [2, 1.5, 1]),
      "mean(logged reward-to-risk ratio)",
      "The average reward you target per unit of risk.",
      s.avgRr
        ? `Average planned reward-to-risk is ${s.avgRr.toFixed(2)}R across the trades where you logged it.`
        : NOT_ENOUGH,
    ),
    m(
      "largestWin",
      "Largest Winner",
      s.best ? r2(pl(s.best)) : null,
      s.best ? fmtMoney(pl(s.best)) : "—",
      { rating: "neutral", ratingLabel: s.best?.asset ?? "" },
      "max(P/L)",
      "Your single best completed trade.",
      s.best
        ? `${s.best.asset} on ${s.best.opened_at.slice(0, 10)} produced ${fmtMoney(pl(s.best))}.`
        : NOT_ENOUGH,
    ),
    m(
      "largestLoss",
      "Largest Loser",
      s.worst ? r2(pl(s.worst)) : null,
      s.worst ? fmtMoney(pl(s.worst)) : "—",
      { rating: "neutral", ratingLabel: s.worst?.asset ?? "" },
      "min(P/L)",
      "Your single worst completed trade.",
      s.worst
        ? `${s.worst.asset} on ${s.worst.opened_at.slice(0, 10)} cost ${fmtMoney(pl(s.worst))}.`
        : NOT_ENOUGH,
    ),
    m(
      "winStreak",
      "Consecutive Wins",
      st.longestWinStreak,
      String(st.longestWinStreak),
      { rating: "neutral", ratingLabel: "longest run" },
      "longest unbroken sequence of winning trades",
      "Your best run of green trades.",
      n ? `Longest winning streak: ${st.longestWinStreak} trades.` : NOT_ENOUGH,
    ),
    m(
      "lossStreak",
      "Consecutive Losses",
      st.longestLossStreak,
      String(st.longestLossStreak),
      { rating: "neutral", ratingLabel: "longest run" },
      "longest unbroken sequence of losing trades",
      "Your worst run of red trades — the drawdown your psychology must survive.",
      n ? `Longest losing streak: ${st.longestLossStreak} trades.` : NOT_ENOUGH,
    ),
    m(
      "holding",
      "Average Holding Time",
      durations.length ? r2(mean(durations)) : null,
      durations.length ? `${r2(mean(durations))}h` : "—",
      { rating: "neutral", ratingLabel: `${durations.length} closed trades` },
      "mean(close time − open time)",
      "How long you typically stay in a position.",
      durations.length
        ? `Average hold is ${r2(mean(durations))} hours across ${durations.length} trades with a close time logged.`
        : NOT_ENOUGH,
    ),
    m(
      "avgRisk",
      "Average Risk %",
      risks.length ? r2(mean(risks)) : null,
      risks.length ? `${r2(mean(risks))}%` : "—",
      risks.length
        ? mean(risks) <= 1
          ? { rating: "excellent" as Rating, ratingLabel: "Conservative" }
          : mean(risks) <= 2
            ? { rating: "good" as Rating, ratingLabel: "Standard" }
            : { rating: "poor" as Rating, ratingLabel: "Aggressive" }
        : { rating: "neutral" as Rating, ratingLabel: "No data" },
      "mean(risk % logged per trade)",
      "How much of the account you put at risk per trade.",
      risks.length
        ? `You risk ${r2(mean(risks))}% per trade on average, with a spread of ±${r2(stdev(risks))}%.`
        : NOT_ENOUGH,
    ),
    m(
      "avgSize",
      "Average Position Size",
      sizes.length ? r2(mean(sizes)) : null,
      sizes.length ? r2(mean(sizes)).toLocaleString() : "—",
      { rating: "neutral", ratingLabel: `${sizes.length} sized trades` },
      "mean(position size logged per trade)",
      "Typical size of the positions you take.",
      sizes.length
        ? `Average position size is ${r2(mean(sizes)).toLocaleString()} with a standard deviation of ${r2(stdev(sizes)).toLocaleString()} — lower spread means more repeatable sizing.`
        : NOT_ENOUGH,
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* 2. Monte Carlo                                                      */
/* ------------------------------------------------------------------ */

export type MonteCarloResult = {
  runs: number;
  horizon: number;
  startCapital: number;
  bands: {
    step: number;
    p5: number;
    p25: number;
    median: number;
    p75: number;
    p95: number;
    best: number;
    worst: number;
  }[];
  samples: { step: number; [key: string]: number }[];
  finalMedian: number;
  finalMean: number;
  finalBest: number;
  finalWorst: number;
  ci95: [number, number];
  expectedDrawdown: number;
  maxExpectedDrawdown: number;
  probProfit: number;
  distribution: { label: string; count: number; from: number }[];
};

export function monteCarlo(trades: Trade[], runs: number, horizon?: number): MonteCarloResult | null {
  const outcomes = trades.map(pl);
  if (outcomes.length < MIN_TRADES) return null;

  const steps = Math.max(20, Math.min(horizon ?? outcomes.length, 250));
  const startCapital = estimatedCapital(trades);

  const paths: number[][] = [];
  const finals: number[] = [];
  const drawdowns: number[] = [];

  for (let r = 0; r < runs; r++) {
    let equity = startCapital;
    let peak = startCapital;
    let worstDd = 0;
    const path = new Array<number>(steps + 1);
    path[0] = equity;
    for (let i = 1; i <= steps; i++) {
      equity += outcomes[(Math.random() * outcomes.length) | 0];
      peak = Math.max(peak, equity);
      worstDd = Math.min(worstDd, equity - peak);
      path[i] = equity;
    }
    paths.push(path);
    finals.push(equity);
    drawdowns.push(worstDd);
  }

  const bands = [];
  for (let i = 0; i <= steps; i++) {
    const col = paths.map((p) => p[i]).sort((a, b) => a - b);
    bands.push({
      step: i,
      p5: r2(percentile(col, 5)),
      p25: r2(percentile(col, 25)),
      median: r2(percentile(col, 50)),
      p75: r2(percentile(col, 75)),
      p95: r2(percentile(col, 95)),
      best: r2(col[col.length - 1]),
      worst: r2(col[0]),
    });
  }

  const sampleCount = Math.min(12, paths.length);
  const samples = bands.map((b, i) => {
    const row: { step: number; [key: string]: number } = { step: b.step };
    for (let s = 0; s < sampleCount; s++) row[`p${s}`] = r2(paths[s][i]);
    return row;
  });

  const sortedFinals = [...finals].sort((a, b) => a - b);
  const sortedDd = [...drawdowns].sort((a, b) => a - b);

  const lo = sortedFinals[0];
  const hi = sortedFinals[sortedFinals.length - 1];
  const buckets = 16;
  const width = (hi - lo) / buckets || 1;
  const distribution = Array.from({ length: buckets }, (_, i) => ({
    label: `${Math.round(lo + i * width).toLocaleString()}`,
    from: lo + i * width,
    count: 0,
  }));
  for (const f of sortedFinals) {
    const idx = Math.min(buckets - 1, Math.floor((f - lo) / width));
    distribution[idx].count += 1;
  }

  return {
    runs,
    horizon: steps,
    startCapital,
    bands,
    samples,
    finalMedian: r2(percentile(sortedFinals, 50)),
    finalMean: r2(mean(finals)),
    finalBest: r2(hi),
    finalWorst: r2(lo),
    ci95: [r2(percentile(sortedFinals, 2.5)), r2(percentile(sortedFinals, 97.5))],
    expectedDrawdown: r2(percentile(sortedDd, 50)),
    maxExpectedDrawdown: r2(sortedDd[0]),
    probProfit: r2((finals.filter((f) => f > startCapital).length / finals.length) * 100),
    distribution,
  };
}

/* ------------------------------------------------------------------ */
/* 3. Probability analytics                                            */
/* ------------------------------------------------------------------ */

export type ProbabilityStat = {
  key: string;
  label: string;
  display: string;
  detail: string;
  tone: Rating;
};

export function probabilityAnalytics(trades: Trade[], mc: MonteCarloResult | null) {
  if (trades.length < MIN_TRADES || !mc) return null;
  const s = computeStats(trades);
  const capital = mc.startCapital;
  const exp = expectancy(trades) ?? 0;
  const w = s.winRate / 100;
  const ed = edgeRatio(trades);

  // Classic risk-of-ruin approximation for a fixed-fraction bettor.
  const payoff = ed ?? 1;
  const advantage = w - (1 - w) / payoff;
  const risks = trades.map((t) => Number(t.risk_percent)).filter(Number.isFinite);
  const riskFraction = (risks.length ? mean(risks) : 1) / 100;
  const units = riskFraction > 0 ? 1 / riskFraction : 100;
  const ruin =
    advantage <= 0 ? 100 : Math.min(100, ((1 - advantage) / (1 + advantage)) ** units * 100);

  const monthly = tradesPerMonth(trades);
  const dd = Math.abs(maxDrawdownValue(trades));
  const curve = drawdownCurve(trades);
  const currentDd = curve.length ? Math.abs(curve[curve.length - 1].drawdown) : 0;

  const stats: ProbabilityStat[] = [
    {
      key: "ruin",
      label: "Probability of Ruin",
      display: `${ruin.toFixed(2)}%`,
      detail: `Based on a ${(riskFraction * 100).toFixed(2)}% average risk, a ${s.winRate.toFixed(1)}% win rate and a ${payoff.toFixed(2)} payoff ratio over ${trades.length} trades.`,
      tone: ruin < 1 ? "excellent" : ruin < 5 ? "good" : ruin < 20 ? "average" : "poor",
    },
    {
      key: "recovery",
      label: "Probability of Recovery",
      display: currentDd === 0 ? "At equity high" : `${(100 - ruin).toFixed(1)}%`,
      detail:
        currentDd === 0
          ? "Your equity curve is currently at its peak, so there is no drawdown to recover."
          : `You are ${Math.round(currentDd)} currency units below peak; with an expectancy of ${exp.toFixed(2)} per trade that is roughly ${Math.max(1, Math.ceil(currentDd / Math.max(exp, 0.01)))} trades of recovery if the edge holds.`,
      tone: currentDd === 0 ? "excellent" : ruin < 10 ? "good" : "average",
    },
    {
      key: "target",
      label: "Reaching +10% Profit Target",
      display: `${probFinalAbove(mc, capital * 1.1).toFixed(1)}%`,
      detail: `Share of ${mc.runs.toLocaleString()} resamples of your own trade outcomes that finish above ${Math.round(capital * 1.1).toLocaleString()} after ${mc.horizon} trades.`,
      tone: band(probFinalAbove(mc, capital * 1.1), [70, 50, 30]).rating,
    },
    {
      key: "high",
      label: "Probability of New Equity High",
      display: `${probFinalAbove(mc, capital + currentDd).toFixed(1)}%`,
      detail: `Share of simulations that clear the current peak (${Math.round(capital + currentDd).toLocaleString()}) within ${mc.horizon} trades.`,
      tone: band(probFinalAbove(mc, capital + currentDd), [70, 50, 30]).rating,
    },
    {
      key: "blow",
      label: "Risk of Blowing the Account",
      display: `${(100 - probFinalAbove(mc, capital * 0.5)).toFixed(1)}%`,
      detail: `Share of simulations that end below half the estimated ${capital.toLocaleString()} account.`,
      tone: band(probFinalAbove(mc, capital * 0.5), [95, 90, 75]).rating,
    },
    {
      key: "monthly",
      label: "Expected Monthly Return",
      display: `${((exp * monthly) / capital * 100).toFixed(2)}%`,
      detail: `Expectancy of ${exp.toFixed(2)} per trade × ${monthly.toFixed(1)} trades per month, against an estimated ${capital.toLocaleString()} account.`,
      tone: exp > 0 ? "good" : "poor",
    },
    {
      key: "yearly",
      label: "Expected Yearly Return",
      display: `${((exp * monthly * 12) / capital * 100).toFixed(2)}%`,
      detail: "Monthly expectation extended over twelve months at your current trade frequency. Not a forecast of markets — only of your own realised statistics repeating.",
      tone: exp > 0 ? "good" : "poor",
    },
    {
      key: "dd",
      label: "Expected Drawdown",
      display: fmtMoney(mc.expectedDrawdown),
      detail: `Median worst drawdown across ${mc.runs.toLocaleString()} simulations. Your realised maximum so far is ${fmtMoney(-dd)}.`,
      tone: "neutral",
    },
    {
      key: "survival",
      label: "Capital Survival Probability",
      display: `${(100 - ruin).toFixed(2)}%`,
      detail: `Complement of the risk-of-ruin estimate at your current sizing discipline (risk spread ±${risks.length ? stdev(risks).toFixed(2) : "0.00"}%).`,
      tone: ruin < 5 ? "excellent" : ruin < 20 ? "average" : "poor",
    },
  ];
  return stats;
}

function probFinalAbove(mc: MonteCarloResult, threshold: number) {
  const finals = mc.bands[mc.bands.length - 1];
  // Reconstruct from percentile grid: interpolate across the stored quantiles.
  const grid: [number, number][] = [
    [0, finals.worst],
    [5, finals.p5],
    [25, finals.p25],
    [50, finals.median],
    [75, finals.p75],
    [95, finals.p95],
    [100, finals.best],
  ];
  if (threshold <= grid[0][1]) return 100;
  if (threshold >= grid[grid.length - 1][1]) return 0;
  for (let i = 1; i < grid.length; i++) {
    if (threshold <= grid[i][1]) {
      const [pLo, vLo] = grid[i - 1];
      const [pHi, vHi] = grid[i];
      const pct = vHi === vLo ? pHi : pLo + ((threshold - vLo) / (vHi - vLo)) * (pHi - pLo);
      return Math.max(0, Math.min(100, 100 - pct));
    }
  }
  return 0;
}

function tradesPerMonth(trades: Trade[]) {
  const list = asc(trades);
  if (list.length < 2) return list.length;
  const months =
    (new Date(list[list.length - 1].opened_at).getTime() - new Date(list[0].opened_at).getTime()) /
    (30.44 * 24 * 3600 * 1000);
  return months > 0.2 ? list.length / months : list.length;
}

/* ------------------------------------------------------------------ */
/* 4. Equity analytics                                                 */
/* ------------------------------------------------------------------ */

export function equitySeries(trades: Trade[]) {
  const list = asc(trades);
  const start = estimatedCapital(trades);
  let equity = start;
  let peak = start;
  const rollingWindow = 10;
  const pnls: number[] = [];

  const points = list.map((t, i) => {
    const p = pl(t);
    equity += p;
    peak = Math.max(peak, equity);
    pnls.push(p);
    const window = pnls.slice(Math.max(0, i - rollingWindow + 1));
    return {
      index: i + 1,
      date: t.opened_at.slice(0, 10),
      balance: r2(equity),
      pnl: r2(p),
      peak: r2(peak),
      floating: r2(equity - peak),
      rolling: r2(window.reduce((s, x) => s + x, 0)),
      growth: r2(((equity - start) / start) * 100),
    };
  });

  // Smoothed equity: simple moving average of the balance curve.
  const smoothed = points.map((pt, i) => {
    const slice = points.slice(Math.max(0, i - 9), i + 1);
    return { ...pt, smooth: r2(mean(slice.map((x) => x.balance))) };
  });

  const monthly = bucketSeries(list, (t) => t.opened_at.slice(0, 7), start);
  const yearly = bucketSeries(list, (t) => t.opened_at.slice(0, 4), start);

  return { start, points: smoothed, monthly, yearly };
}

function bucketSeries(list: Trade[], key: (t: Trade) => string, start: number) {
  const map = new Map<string, number>();
  for (const t of list) map.set(key(t), (map.get(key(t)) ?? 0) + pl(t));
  let cum = start;
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, pnlValue]) => {
      cum += pnlValue;
      return { name, pnl: r2(pnlValue), equity: r2(cum) };
    });
}

/* ------------------------------------------------------------------ */
/* 5. Drawdown analytics                                               */
/* ------------------------------------------------------------------ */

export function drawdownAnalytics(trades: Trade[]) {
  const list = asc(trades);
  const start = estimatedCapital(trades);
  let equity = start;
  let peak = start;
  const series: { index: number; date: string; equity: number; drawdown: number; pctDd: number }[] =
    [];
  const episodes: { start: string; end: string | null; depth: number; trades: number }[] = [];
  let current: { start: string; depth: number; trades: number } | null = null;

  for (const [i, t] of list.entries()) {
    equity += pl(t);
    if (equity >= peak) {
      peak = equity;
      if (current) {
        episodes.push({ ...current, end: t.opened_at.slice(0, 10) });
        current = null;
      }
    } else {
      current = current ?? { start: t.opened_at.slice(0, 10), depth: 0, trades: 0 };
      current.depth = Math.min(current.depth, equity - peak);
      current.trades += 1;
    }
    series.push({
      index: i + 1,
      date: t.opened_at.slice(0, 10),
      equity: r2(equity),
      drawdown: r2(equity - peak),
      pctDd: r2(((equity - peak) / peak) * 100),
    });
  }
  if (current) episodes.push({ ...current, end: null });

  const depths = episodes.map((e) => Math.abs(e.depth)).filter((d) => d > 0);
  const closed = episodes.filter((e) => e.end);
  const rolling = series.map((pt, i) => {
    const slice = series.slice(Math.max(0, i - 19), i + 1);
    return { ...pt, rolling: r2(Math.min(...slice.map((x) => x.drawdown))) };
  });

  const monthly = new Map<string, number>();
  for (const pt of series) {
    const key = pt.date.slice(0, 7);
    monthly.set(key, Math.min(monthly.get(key) ?? 0, pt.drawdown));
  }

  return {
    series: rolling,
    episodes: episodes.sort((a, b) => a.depth - b.depth).slice(0, 10),
    maxDrawdown: r2(series.length ? Math.min(...series.map((s) => s.drawdown)) : 0),
    avgDrawdown: depths.length ? r2(-mean(depths)) : 0,
    currentDrawdown: series.length ? series[series.length - 1].drawdown : 0,
    longestDrawdown: episodes.reduce((max, e) => Math.max(max, e.trades), 0),
    recoveryTradesAvg: closed.length ? Math.round(mean(closed.map((e) => e.trades))) : null,
    recoveryFactor: recoveryFactorValue(trades),
    monthly: [...monthly.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value: r2(value) })),
  };
}

/* ------------------------------------------------------------------ */
/* 6. Distributions                                                    */
/* ------------------------------------------------------------------ */

export function histogram(values: number[], edges: number[], labels: string[]) {
  const counts = labels.map((label) => ({ label, count: 0 }));
  for (const v of values) {
    let bucket = edges.findIndex((e) => v < e);
    if (bucket === -1) bucket = labels.length - 1;
    counts[bucket].count += 1;
  }
  return counts;
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function distributions(trades: Trade[]) {
  const wins = trades.map(pl).filter((v) => v > 0);
  const losses = trades.map(pl).filter((v) => v < 0).map(Math.abs);
  const money = (v: number[]) =>
    histogram(v, [50, 100, 250, 500, 1000], ["<50", "50–100", "100–250", "250–500", "500–1k", "1k+"]);

  const durations = trades.map(durationHours).filter((h): h is number => h !== null);

  const counted = (key: (t: Trade) => string | null) =>
    groupBy(trades, key).map((g) => ({ ...g, name: g.name }));

  return {
    profit: money(wins),
    loss: money(losses),
    rr: histogram(
      trades.map((t) => Number(t.rr_ratio)).filter((v) => Number.isFinite(v) && v > 0),
      [1, 1.5, 2, 3, 5],
      ["<1R", "1–1.5R", "1.5–2R", "2–3R", "3–5R", "5R+"],
    ),
    holding: histogram(
      durations,
      [0.25, 1, 4, 24, 72],
      ["<15m", "15m–1h", "1–4h", "4–24h", "1–3d", "3d+"],
    ),
    size: histogram(
      trades.map((t) => Number(t.position_size)).filter(Number.isFinite),
      [0.5, 1, 5, 10, 50],
      ["<0.5", "0.5–1", "1–5", "5–10", "10–50", "50+"],
    ),
    risk: histogram(
      trades.map((t) => Number(t.risk_percent)).filter(Number.isFinite),
      [0.5, 1, 2, 3, 5],
      ["<0.5%", "0.5–1%", "1–2%", "2–3%", "3–5%", "5%+"],
    ),
    session: counted((t) => t.session),
    strategy: counted((t) => t.strategy),
    market: counted((t) => t.market),
    asset: counted((t) => t.asset).slice(0, 12),
    timeframe: counted((t) => t.timeframe),
    emotion: counted((t) => t.emotional_state),
    dayOfWeek: counted((t) => DOW[new Date(t.opened_at).getDay()]),
    hour: counted((t) => `${String(new Date(t.opened_at).getUTCHours()).padStart(2, "0")}:00`).sort(
      (a, b) => a.name.localeCompare(b.name),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* 7. Correlation engine                                               */
/* ------------------------------------------------------------------ */

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? r2(num / den) : null;
}

const NUMERIC_FIELDS: { key: string; label: string; get: (t: Trade) => number | null }[] = [
  { key: "risk", label: "Risk %", get: (t) => num(t.risk_percent) },
  { key: "size", label: "Position Size", get: (t) => num(t.position_size) },
  { key: "rr", label: "RR Ratio", get: (t) => num(t.rr_ratio) },
  { key: "confidence", label: "Confidence", get: (t) => num(t.confidence_level) },
  { key: "fear", label: "Fear", get: (t) => num(t.fear_level) },
  { key: "greed", label: "Greed", get: (t) => num(t.greed_level) },
  { key: "discipline", label: "Discipline", get: (t) => num(t.discipline_level) },
  { key: "patience", label: "Patience", get: (t) => num(t.patience_level) },
  { key: "duration", label: "Hold Time", get: (t) => durationHours(t) },
  { key: "pnl", label: "P/L", get: (t) => pl(t) },
];

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function correlationMatrix(trades: Trade[]) {
  const fields = NUMERIC_FIELDS.filter(
    (f) => trades.filter((t) => f.get(t) !== null).length >= 3,
  );
  return {
    fields: fields.map((f) => f.label),
    rows: fields.map((a) => ({
      label: a.label,
      cells: fields.map((b) => {
        const pairs = trades
          .map((t) => [a.get(t), b.get(t)] as const)
          .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
        return {
          label: b.label,
          value: pearson(
            pairs.map((p) => p[0]),
            pairs.map((p) => p[1]),
          ),
          n: pairs.length,
        };
      }),
    })),
  };
}

export function pnlCorrelations(trades: Trade[]) {
  return NUMERIC_FIELDS.filter((f) => f.key !== "pnl")
    .map((f) => {
      const pairs = trades
        .map((t) => [f.get(t), pl(t)] as const)
        .filter((p): p is readonly [number, number] => p[0] !== null);
      return { label: f.label, value: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), n: pairs.length };
    })
    .filter((x) => x.value !== null)
    .sort((a, b) => Math.abs(b.value!) - Math.abs(a.value!));
}

export function groupPerformance(trades: Trade[]) {
  const iso = (t: Trade) => new Date(t.opened_at);
  const weekKey = (d: Date) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };
  const bucket = (label: string, key: (t: Trade) => string | null) => ({
    label,
    rows: groupBy(trades, key),
  });

  return [
    bucket("Day", (t) => t.opened_at.slice(0, 10)),
    bucket("Week", (t) => weekKey(iso(t))),
    bucket("Month", (t) => t.opened_at.slice(0, 7)),
    bucket("Quarter", (t) => `${iso(t).getUTCFullYear()}-Q${Math.floor(iso(t).getUTCMonth() / 3) + 1}`),
    bucket("Year", (t) => t.opened_at.slice(0, 4)),
    bucket("Session", (t) => t.session),
    bucket("Strategy", (t) => t.strategy),
    bucket("Market", (t) => t.market),
    bucket("Asset", (t) => t.asset),
    bucket("Timeframe", (t) => t.timeframe),
    bucket("Emotion", (t) => t.emotional_state),
    bucket("Setup Type", (t) => t.setup_type),
    bucket("Confidence", (t) =>
      t.confidence_level === null ? null : `Confidence ${t.confidence_level}/10`,
    ),
    bucket("Risk %", (t) =>
      t.risk_percent === null
        ? null
        : Number(t.risk_percent) < 0.5
          ? "<0.5%"
          : Number(t.risk_percent) < 1
            ? "0.5–1%"
            : Number(t.risk_percent) < 2
              ? "1–2%"
              : Number(t.risk_percent) < 3
                ? "2–3%"
                : "3%+",
    ),
    bucket("Position Size", (t) =>
      t.position_size === null
        ? null
        : Number(t.position_size) < 1
          ? "<1"
          : Number(t.position_size) < 5
            ? "1–5"
            : Number(t.position_size) < 10
              ? "5–10"
              : "10+",
    ),
    bucket("RR", (t) =>
      t.rr_ratio === null
        ? null
        : Number(t.rr_ratio) < 1
          ? "<1R"
          : Number(t.rr_ratio) < 2
            ? "1–2R"
            : Number(t.rr_ratio) < 3
              ? "2–3R"
              : "3R+",
    ),
  ];
}
