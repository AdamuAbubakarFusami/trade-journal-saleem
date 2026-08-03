/**
 * Institutional Intelligence engine.
 *
 * Every number produced here is derived deterministically from the trader's own
 * completed journal rows. Nothing about future market prices is predicted, and no
 * statistic is invented: when the sample is too small the helpers return `null`
 * and the UI shows "Not enough trading data yet."
 */
import {
  MIN_TRADES,
  NOT_ENOUGH,
  durationHours,
  estimatedCapital,
  mean,
  percentile,
  stdev,
  type Rating,
} from "./institutional";
import { drawdownCurve, maxDrawdownValue } from "./quant";
import { computeStats, groupBy, type Trade } from "./trades";

export { MIN_TRADES, NOT_ENOUGH };

const pl = (t: Trade) => Number(t.profit_loss || 0);
const r2 = (n: number) => Number(n.toFixed(2));
const asc = (trades: Trade[]) =>
  [...trades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmtMoney = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtPct = (v: number, d = 1) => `${v.toFixed(d)}%`;

export type IntelMetric = {
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

function band(
  value: number | null,
  good: number,
  ok: number,
  weak: number,
  invert = false,
): { rating: Rating; ratingLabel: string } {
  if (value === null || !Number.isFinite(value)) return { rating: "neutral", ratingLabel: "No data" };
  const v = invert ? -value : value;
  const g = invert ? -good : good;
  const o = invert ? -ok : ok;
  const w = invert ? -weak : weak;
  if (v >= g) return { rating: "excellent", ratingLabel: "Excellent" };
  if (v >= o) return { rating: "good", ratingLabel: "Good" };
  if (v >= w) return { rating: "average", ratingLabel: "Average" };
  return { rating: "poor", ratingLabel: "Poor" };
}

/* ------------------------------------------------------------------ */
/* Shared edge profile                                                 */
/* ------------------------------------------------------------------ */

export type EdgeProfile = {
  sample: number;
  capital: number;
  winRate: number;
  payoff: number;
  avgWin: number;
  avgLoss: number;
  riskFraction: number;
  expectancyR: number;
  expectancyMoney: number;
};

export function edgeProfile(trades: Trade[]): EdgeProfile | null {
  if (trades.length < MIN_TRADES) return null;
  const s = computeStats(trades);
  const capital = estimatedCapital(trades);
  const risks = trades.map((t) => num(t.risk_percent)).filter((v): v is number => v !== null && v > 0);
  const riskPct = risks.length ? mean(risks) : s.avgLoss && capital ? (s.avgLoss / capital) * 100 : 1;
  const riskFraction = Math.min(0.5, Math.max(0.0005, riskPct / 100));
  const payoff = s.avgLoss ? s.avgWin / s.avgLoss : 0;
  const w = s.winRate / 100;
  return {
    sample: trades.length,
    capital,
    winRate: s.winRate,
    payoff: r2(payoff),
    avgWin: r2(s.avgWin),
    avgLoss: r2(s.avgLoss),
    riskFraction,
    expectancyR: r2(w * payoff - (1 - w)),
    expectancyMoney: r2(w * s.avgWin - (1 - w) * s.avgLoss),
  };
}

/* ------------------------------------------------------------------ */
/* Section 1 — Risk of ruin                                            */
/* ------------------------------------------------------------------ */

export type RuinAnalytics = {
  edge: EdgeProfile;
  metrics: IntelMetric[];
  riskOfRuin: number;
  survivalRate: number;
  survivalCurve: { trade: number; survival: number }[];
  decayCurve: { trade: number; worst: number; median: number; best: number }[];
};

/** Resamples the trader's own realised R-multiples to model capital paths. */
function rMultiples(trades: Trade[], edge: EdgeProfile) {
  const unit = edge.avgLoss || 1;
  return trades.map((t) => pl(t) / unit);
}

export function ruinAnalytics(trades: Trade[], horizon = 200, runs = 4000): RuinAnalytics | null {
  const edge = edgeProfile(trades);
  if (!edge) return null;

  const rs = rMultiples(trades, edge);
  const risk = edge.riskFraction;
  const alive = new Array(horizon + 1).fill(0) as number[];
  const paths: number[][] = [];

  for (let run = 0; run < runs; run++) {
    let capital = 1;
    let ruined = false;
    const path: number[] = [1];
    for (let i = 1; i <= horizon; i++) {
      if (!ruined) {
        const r = rs[Math.floor(Math.random() * rs.length)];
        capital += capital * risk * r;
        if (capital <= 0.2) {
          ruined = true;
          capital = 0.2;
        }
      }
      if (!ruined) alive[i] += 1;
      path.push(capital);
    }
    alive[0] += 1;
    if (paths.length < 400) paths.push(path);
  }

  const survivalCurve = alive.map((count, i) => ({
    trade: i,
    survival: r2((count / runs) * 100),
  }));
  const survivalRate = survivalCurve[survivalCurve.length - 1].survival;
  const riskOfRuin = r2(100 - survivalRate);

  const decayCurve = Array.from({ length: Math.min(horizon, 100) + 1 }, (_, k) => {
    const i = Math.round((k / Math.min(horizon, 100)) * horizon);
    const slice = paths.map((p) => p[i] * edge.capital).sort((a, b) => a - b);
    return {
      trade: i,
      worst: r2(percentile(slice, 5)),
      median: r2(percentile(slice, 50)),
      best: r2(percentile(slice, 95)),
    };
  });

  const requiredWinRate = edge.payoff > 0 ? (1 / (1 + edge.payoff)) * 100 : null;
  const w = edge.winRate / 100;
  const requiredRr = w > 0 && w < 1 ? (1 - w) / w : null;
  const lossesToRuin = Math.floor(Math.log(0.2) / Math.log(1 - risk));
  const lossesToHalf = Math.floor(Math.log(0.5) / Math.log(1 - risk));

  const metrics: IntelMetric[] = [
    {
      key: "ror",
      label: "Risk of ruin",
      value: round2(riskOfRuin),
      display: fmtPct(riskOfRuin, 2),
      ...band(-riskOfRuin, -1, -5, -15),
      formula: "share of resampled paths losing 80% of capital within " + horizon + " trades",
      plain: "How often your own trade distribution destroys the account over the next stretch.",
      interpretation:
        riskOfRuin < 1
          ? "Your sizing and edge combination survives nearly every resampled path."
          : riskOfRuin < 10
            ? "Survivable, but a bad cluster of losses would hurt. Watch position size."
            : "Sizing is too aggressive for the edge your journal actually shows.",
    },
    {
      key: "bankruptcy",
      label: "Probability of bankruptcy",
      value: round2(riskOfRuin),
      display: fmtPct(riskOfRuin, 2),
      ...band(-riskOfRuin, -1, -5, -15),
      formula: "P(capital ≤ 20% of start) over " + horizon + " resampled trades",
      plain: "Chance the account becomes untradeable at your current risk per trade.",
      interpretation:
        "Bankruptcy here means capital falls to a level where your normal risk per trade is no longer viable.",
    },
    {
      key: "survival",
      label: "Capital survival rate",
      value: survivalRate,
      display: fmtPct(survivalRate, 2),
      ...band(survivalRate, 99, 95, 85),
      formula: "100% − risk of ruin",
      plain: "Share of simulated futures where the account is still tradeable.",
      interpretation: `${survivalRate.toFixed(1)}% of resampled paths kept the account alive across ${horizon} trades.`,
    },
    {
      key: "reqWin",
      label: "Required win rate",
      value: requiredWinRate,
      display: requiredWinRate === null ? "—" : fmtPct(requiredWinRate),
      ...band(requiredWinRate === null ? null : edge.winRate - requiredWinRate, 10, 3, 0),
      formula: "1 / (1 + payoff ratio)",
      plain: "Break-even win rate for the payoff ratio you actually achieve.",
      interpretation:
        requiredWinRate === null
          ? "Not enough win/loss data to derive the break-even win rate."
          : `You need ${requiredWinRate.toFixed(1)}% to break even and you are at ${edge.winRate.toFixed(1)}%.`,
    },
    {
      key: "reqRr",
      label: "Required RR",
      value: requiredRr,
      display: requiredRr === null ? "—" : `${requiredRr.toFixed(2)}R`,
      ...band(requiredRr === null ? null : edge.payoff - requiredRr, 0.5, 0.2, 0),
      formula: "(1 − win rate) / win rate",
      plain: "Minimum reward-to-risk needed for your current win rate to break even.",
      interpretation:
        requiredRr === null
          ? "Not enough data to derive the break-even payoff."
          : `Break-even payoff is ${requiredRr.toFixed(2)}R; your realised payoff is ${edge.payoff.toFixed(2)}R.`,
    },
    {
      key: "maxLosses",
      label: "Max consecutive losses sustainable",
      value: lossesToRuin,
      display: `${lossesToRuin} trades`,
      ...band(lossesToRuin, 40, 25, 15),
      formula: "log(0.2) / log(1 − risk fraction)",
      plain: `At ${(risk * 100).toFixed(2)}% risk per trade, the losing streak that would end the account.`,
      interpretation: `A ${lossesToHalf}-trade losing streak halves the account; ${lossesToRuin} straight losses would end it.`,
    },
  ];

  return { edge, metrics, riskOfRuin, survivalRate, survivalCurve, decayCurve };
}

function round2(v: number) {
  return Number(v.toFixed(2));
}

/* ------------------------------------------------------------------ */
/* Section 2 — Position sizing engine                                  */
/* ------------------------------------------------------------------ */

export type SizingModel = {
  key: string;
  label: string;
  formula: string;
  riskPercent: number | null;
  riskMoney: number | null;
  display: string;
  plain: string;
  interpretation: string;
};

export type SizingResult = {
  edge: EdgeProfile;
  actualRiskPercent: number;
  actualRiskMoney: number;
  models: SizingModel[];
  comparison: { name: string; recommended: number; actual: number }[];
};

/** Ralph Vince optimal f, solved on a grid over the trader's realised outcomes. */
function optimalF(trades: Trade[]) {
  const values = trades.map(pl);
  const worst = Math.abs(Math.min(...values, 0));
  if (!worst) return null;
  let bestF = 0;
  let bestTwr = 1;
  for (let f = 0.01; f <= 0.9; f += 0.01) {
    let twr = 1;
    for (const v of values) twr *= 1 + (f * -v) / worst;
    if (twr > bestTwr) {
      bestTwr = twr;
      bestF = f;
    }
  }
  return bestF > 0 ? r2(bestF * 100) : null;
}

export function positionSizing(trades: Trade[]): SizingResult | null {
  const edge = edgeProfile(trades);
  if (!edge) return null;

  const capital = edge.capital;
  const w = edge.winRate / 100;
  const kelly = edge.payoff > 0 ? (w - (1 - w) / edge.payoff) * 100 : null;
  const half = kelly === null ? null : kelly / 2;
  const optF = optimalF(trades);

  // Volatility proxies from the journal itself.
  const stopDistances = trades
    .map((t) => {
      const e = num(t.entry_price);
      const s = num(t.stop_loss);
      return e !== null && s !== null && e > 0 ? Math.abs(e - s) : null;
    })
    .filter((v): v is number => v !== null && v > 0);
  const avgStop = stopDistances.length ? mean(stopDistances) : null;
  const pnlVol = stdev(trades.map(pl));
  const volRisk = pnlVol && capital ? Math.min(5, (pnlVol / capital) * 100) : null;

  const actualRiskPercent = r2(edge.riskFraction * 100);
  const actualRiskMoney = r2((edge.riskFraction * capital));

  const model = (
    key: string,
    label: string,
    formula: string,
    riskPercent: number | null,
    plain: string,
    interpretation: string,
    display?: string,
  ): SizingModel => ({
    key,
    label,
    formula,
    riskPercent: riskPercent === null ? null : r2(riskPercent),
    riskMoney: riskPercent === null ? null : r2((riskPercent / 100) * capital),
    display:
      display ??
      (riskPercent === null
        ? "—"
        : `${riskPercent.toFixed(2)}% · ${fmtMoney((riskPercent / 100) * capital)}`),
    plain,
    interpretation,
  });

  const models: SizingModel[] = [
    model(
      "fixed-risk",
      "Fixed risk",
      "size = (capital × risk%) ÷ (entry − stop)",
      1,
      "The classic institutional default: one fixed percentage of capital per idea.",
      `At 1% of ${fmtMoney(capital)} you risk ${fmtMoney(capital * 0.01)} per trade regardless of conviction.`,
    ),
    model(
      "fixed-dollar",
      "Fixed dollar",
      "size = fixed $ risk ÷ (entry − stop)",
      (Math.abs(edge.avgLoss) / capital) * 100,
      "Risk the same cash amount every time — your own realised average loss.",
      `Your average realised loss is ${fmtMoney(edge.avgLoss)}, which is the dollar unit your journal already trades.`,
    ),
    model(
      "kelly",
      "Kelly criterion",
      "f* = W − (1 − W) ÷ payoff",
      kelly,
      "Growth-optimal fraction implied by your win rate and payoff ratio.",
      kelly === null
        ? "Payoff ratio is not measurable yet."
        : kelly <= 0
          ? "Kelly is negative: the journal shows no positive expectancy to size up on."
          : `Full Kelly suggests ${kelly.toFixed(2)}% per trade — mathematically optimal but very volatile.`,
    ),
    model(
      "half-kelly",
      "Half Kelly",
      "f* ÷ 2",
      half,
      "Half the growth-optimal fraction — the size most funds actually use.",
      half === null || half <= 0
        ? "No positive Kelly fraction to halve yet."
        : `Half Kelly (${half.toFixed(2)}%) keeps most of the growth with roughly a quarter of the variance.`,
    ),
    model(
      "optimal-f",
      "Optimal F",
      "maximise TWR = Π (1 + f × −tradeᵢ ÷ worst loss)",
      optF,
      "Vince's optimal f, solved directly on your realised trade sequence.",
      optF === null
        ? "Needs at least one losing trade to define the worst-case unit."
        : `Optimal f on your history is ${optF.toFixed(2)}% of capital per unit of worst-case loss.`,
    ),
    model(
      "atr",
      "ATR position size",
      "size = (capital × risk%) ÷ (ATR multiple)",
      avgStop && capital ? 1 : null,
      "Volatility-anchored sizing using your logged stop distance as the ATR proxy.",
      avgStop === null
        ? "Log entry and stop prices so stop distance can act as the volatility unit."
        : `Your average stop distance is ${avgStop.toFixed(4)} price units — at 1% risk that is ${(
            (capital * 0.01) /
            avgStop
          ).toFixed(2)} units of size.`,
      avgStop === null
        ? "—"
        : `${((capital * 0.01) / avgStop).toFixed(2)} units @ 1%`,
    ),
    model(
      "volatility",
      "Volatility position size",
      "risk% = target volatility ÷ realised P/L volatility",
      volRisk,
      "Scales exposure inversely to how volatile your own results are.",
      volRisk === null
        ? "Not enough P/L dispersion measured yet."
        : `Your P/L standard deviation is ${fmtMoney(pnlVol)}, i.e. ${volRisk.toFixed(2)}% of estimated capital per trade.`,
    ),
  ];

  const comparison = models
    .filter((m) => m.riskPercent !== null)
    .map((m) => ({ name: m.label, recommended: m.riskPercent as number, actual: actualRiskPercent }));

  return { edge, actualRiskPercent, actualRiskMoney, models, comparison };
}

/* ------------------------------------------------------------------ */
/* Section 3 — Institutional performance metrics                       */
/* ------------------------------------------------------------------ */

export function performanceMetrics(trades: Trade[]): IntelMetric[] | null {
  if (trades.length < MIN_TRADES) return null;
  const s = computeStats(trades);
  const values = trades.map(pl);
  const m = mean(values);
  const sd = stdev(values);
  const downside = values.filter((v) => v < 0);
  const dsd = downside.length
    ? Math.sqrt(downside.reduce((acc, v) => acc + v ** 2, 0) / downside.length)
    : 0;
  const maxDd = Math.abs(maxDrawdownValue(trades));
  const net = s.netPnl;
  const list = asc(trades);
  const years = Math.max(
    (new Date(list[list.length - 1].opened_at).getTime() - new Date(list[0].opened_at).getTime()) /
      (365.25 * 86400000),
    1 / 365.25,
  );
  const annual = net / years;

  const curve = drawdownCurve(trades);
  const capital = estimatedCapital(trades);
  const ulcerSeries = curve.map((p) => (capital ? (Math.abs(p.drawdown) / capital) * 100 : 0));
  const ulcer = ulcerSeries.length
    ? Math.sqrt(ulcerSeries.reduce((acc, v) => acc + v ** 2, 0) / ulcerSeries.length)
    : 0;


  // Average of the largest drawdowns for Sterling.
  const sortedDd = [...ulcerSeries].sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(ulcerSeries.length * 0.1)));
  const avgLargeDd = mean(sortedDd);

  const w = s.winRate / 100;
  const expectancy = w * s.avgWin - (1 - w) * s.avgLoss;
  const n = values.length;
  const wins = s.wins;
  const losses = s.losses;
  // Wald–Wolfowitz runs test Z-score on the win/loss sequence.
  let runs = 1;
  const seq = asc(trades).map((t) => pl(t) >= 0);
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) runs++;
  const expRuns = wins && losses ? (2 * wins * losses) / n + 1 : null;
  const varRuns =
    wins && losses
      ? ((2 * wins * losses) * (2 * wins * losses - n)) / (n * n * (n - 1))
      : null;
  const zScore = expRuns && varRuns && varRuns > 0 ? (runs - expRuns) / Math.sqrt(varRuns) : null;

  const variance = sd ** 2;
  const cv = m !== 0 ? Math.abs(sd / m) : null;

  const build = (
    key: string,
    label: string,
    value: number | null,
    display: string,
    rate: { rating: Rating; ratingLabel: string },
    formula: string,
    plain: string,
    interpretation: string,
  ): IntelMetric => ({
    key,
    label,
    value: value === null ? null : r2(value),
    display,
    ...rate,
    formula,
    plain,
    interpretation,
  });

  const sharpe = sd ? m / sd : null;
  const sortino = dsd ? m / dsd : null;
  const calmar = maxDd ? annual / maxDd : null;
  const mar = maxDd ? net / maxDd : null;
  const gains = values.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const lossSum = Math.abs(values.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const omega = lossSum ? gains / lossSum : null;
  const recovery = maxDd ? net / maxDd : null;
  const sterling = avgLargeDd ? (annual / capital) * 100 / avgLargeDd : null;
  const sqnValue = sd ? (m / sd) * Math.sqrt(n) : null;

  return [
    build("sharpe", "Sharpe ratio", sharpe, sharpe === null ? "—" : sharpe.toFixed(2), band(sharpe, 1, 0.5, 0.2),
      "mean(P/L) ÷ stdev(P/L)",
      "Return earned for every unit of total volatility in your results.",
      sharpe === null ? "Needs more trades to measure dispersion." : sharpe >= 1 ? "Strong risk-adjusted return per trade." : "Volatility is large relative to the average result."),
    build("sortino", "Sortino ratio", sortino, sortino === null ? "—" : sortino.toFixed(2), band(sortino, 1.5, 0.8, 0.3),
      "mean(P/L) ÷ downside deviation",
      "Like Sharpe, but only losses count as risk.",
      sortino === null ? "No losing trades recorded yet, so downside risk is undefined." : "Measures how efficiently you convert downside risk into profit."),
    build("calmar", "Calmar ratio", calmar, calmar === null ? "—" : calmar.toFixed(2), band(calmar, 3, 1.5, 0.5),
      "annualised P/L ÷ max drawdown",
      "Annual profit relative to the deepest equity decline.",
      calmar === null ? "No drawdown recorded yet." : "Above 3 is institutional territory; below 1 means drawdowns eat the year."),
    build("mar", "MAR ratio", mar, mar === null ? "—" : mar.toFixed(2), band(mar, 2, 1, 0.4),
      "net P/L ÷ max drawdown",
      "Total profit earned per dollar of worst decline.",
      mar === null ? "No drawdown recorded yet." : `Every dollar of peak-to-trough pain produced ${mar.toFixed(2)} dollars of profit.`),
    build("omega", "Omega ratio", omega, omega === null ? "—" : omega.toFixed(2), band(omega, 1.6, 1.2, 1),
      "Σ gains ÷ |Σ losses|",
      "Total upside divided by total downside — a threshold-free profit factor.",
      omega === null ? "No losses recorded yet." : omega > 1 ? "Gains outweigh losses across the whole distribution." : "Losses currently outweigh gains."),
    build("recovery", "Recovery factor", recovery, recovery === null ? "—" : recovery.toFixed(2), band(recovery, 3, 1.5, 0.5),
      "net P/L ÷ max drawdown",
      "How quickly the account recovers the damage it takes.",
      recovery === null ? "No drawdown recorded yet." : "Higher means drawdowns are repaired quickly by the edge."),
    build("ulcer", "Ulcer index", ulcer, `${ulcer.toFixed(2)}%`, band(-ulcer, -2, -5, -10),
      "√( mean( drawdown%² ) )",
      "Depth and duration of pain combined into one number.",
      ulcer < 5 ? "Equity spends little time deep underwater." : "Equity spends long stretches underwater — review sizing."),
    build("sterling", "Sterling ratio", sterling, sterling === null ? "—" : sterling.toFixed(2), band(sterling, 2, 1, 0.4),
      "annualised return% ÷ average of largest drawdowns",
      "Calmar's cousin using average large drawdowns instead of the single worst.",
      sterling === null ? "Not enough drawdown history." : "Rewards systems whose typical bad periods stay shallow."),
    build("expectancy", "Expectancy", expectancy, fmtMoney(expectancy), band(expectancy, 50, 10, 0),
      "(win% × avg win) − (loss% × avg loss)",
      "Average dollars produced by an average trade.",
      expectancy > 0 ? `Each trade is worth ${fmtMoney(expectancy)} on average.` : "Average trade is currently negative."),
    build("sqn", "SQN (System Quality Number)", sqnValue, sqnValue === null ? "—" : sqnValue.toFixed(2), band(sqnValue, 2.5, 1.6, 1),
      "(mean ÷ stdev) × √N",
      "Van Tharp's measure of system quality, scaled by sample size.",
      sqnValue === null ? "Needs more trades." : sqnValue >= 2.5 ? "Excellent system quality for this sample." : "System quality is average — reduce variance or raise payoff."),
    build("zscore", "Z score (runs test)", zScore, zScore === null ? "—" : zScore.toFixed(2), band(zScore === null ? null : -Math.abs(zScore), -1, -1.7, -2.5),
      "(runs − expected runs) ÷ √variance(runs)",
      "Whether wins and losses cluster more than chance would allow.",
      zScore === null ? "Needs both wins and losses." : Math.abs(zScore) < 1.96 ? "Streaks look random — no dependency detected." : zScore < 0 ? "Results cluster into streaks: winners follow winners, losers follow losers." : "Results alternate more than chance would predict."),
    build("variance", "Variance", variance, fmtMoney(variance), band(null, 0, 0, 0),
      "σ² of trade P/L",
      "The squared spread of your outcomes.",
      "Reference figure — used inside Sharpe, SQN and the ruin model."),
    build("stdev", "Standard deviation", sd, fmtMoney(sd), band(null, 0, 0, 0),
      "√variance",
      "Typical distance of a trade from your average trade.",
      `A typical trade lands within ${fmtMoney(sd)} of the ${fmtMoney(m)} average.`),
    build("cv", "Coefficient of variation", cv, cv === null ? "—" : cv.toFixed(2), band(cv === null ? null : -cv, -2, -5, -10),
      "stdev ÷ |mean|",
      "Volatility per unit of average return — lower is more consistent.",
      cv === null ? "Average result is zero, so the ratio is undefined." : cv < 5 ? "Results are reasonably consistent around the mean." : "Outcomes swing far more than the average trade is worth."),
  ];
}

/* ------------------------------------------------------------------ */
/* Section 4 — Behavioral intelligence                                 */
/* ------------------------------------------------------------------ */

export type BehaviorPattern = {
  key: string;
  label: string;
  detected: boolean;
  count: number;
  severity: Rating;
  why: string;
  evidence: string[];
  impact: string;
};

const tradeLabel = (t: Trade) =>
  `${t.opened_at.slice(0, 10)} · ${t.asset} ${t.direction} · ${fmtMoney(pl(t))}`;

export function behaviorPatterns(trades: Trade[]): BehaviorPattern[] | null {
  if (trades.length < MIN_TRADES) return null;
  const list = asc(trades);
  const wins = list.filter((t) => pl(t) > 0);
  const losses = list.filter((t) => pl(t) < 0);
  const avgHoldWin = mean(wins.map(durationHours).filter((v): v is number => v !== null));
  const avgHoldLoss = mean(losses.map(durationHours).filter((v): v is number => v !== null));
  const avgRisk = mean(list.map((t) => num(t.risk_percent)).filter((v): v is number => v !== null));
  const avgRr = mean(list.map((t) => num(t.rr_ratio)).filter((v): v is number => v !== null));

  const collect = (predicate: (t: Trade, i: number) => boolean) =>
    list.filter((t, i) => predicate(t, i));

  const impactOf = (rows: Trade[]) =>
    rows.length
      ? `${rows.length} trades · ${fmtMoney(rows.reduce((s, t) => s + pl(t), 0))} net impact`
      : "No occurrences found in your journal.";

  const make = (
    key: string,
    label: string,
    rows: Trade[],
    why: string,
    threshold = 1,
  ): BehaviorPattern => {
    const share = rows.length / list.length;
    return {
      key,
      label,
      detected: rows.length >= threshold,
      count: rows.length,
      severity:
        rows.length === 0
          ? "neutral"
          : share > 0.25
            ? "poor"
            : share > 0.12
              ? "average"
              : "good",
      why,
      evidence: rows.slice(-6).reverse().map(tradeLabel),
      impact: impactOf(rows),
    };
  };

  // Revenge trading: a trade opened within 60 minutes of a loss, with larger risk.
  const revenge = collect((t, i) => {
    if (i === 0) return false;
    const prev = list[i - 1];
    if (pl(prev) >= 0) return false;
    const gap = (new Date(t.opened_at).getTime() - new Date(prev.closed_at ?? prev.opened_at).getTime()) / 60000;
    const risk = num(t.risk_percent);
    return gap >= 0 && gap <= 60 && (risk === null ? false : risk > avgRisk);
  });

  const fear = collect(
    (t) => (num(t.fear_level) ?? 0) >= 7 || t.emotional_state === "fearful",
  );
  const greed = collect(
    (t) => (num(t.greed_level) ?? 0) >= 7 || t.emotional_state === "greedy",
  );
  const fomo = collect((t) => t.emotional_state === "fomo" || t.emotional_state === "impatient");

  // Late entries: FOMO-tagged or low RR with high confidence.
  const late = collect(
    (t) => (num(t.rr_ratio) ?? 99) < 1 && (num(t.confidence_level) ?? 0) >= 7,
  );

  // Early exits: winners closed far faster than the winner average.
  const early = collect(
    (t) => pl(t) > 0 && (durationHours(t) ?? Infinity) < avgHoldWin * 0.4 && avgHoldWin > 0,
  );

  const holdingLosers = collect(
    (t) => pl(t) < 0 && (durationHours(t) ?? 0) > avgHoldWin * 1.5 && avgHoldWin > 0,
  );

  const cuttingWinners = collect(
    (t) => pl(t) > 0 && (num(t.rr_ratio) ?? avgRr) < avgRr * 0.6 && avgRr > 0,
  );

  const overconfidence = collect(
    (t) => (num(t.confidence_level) ?? 0) >= 8 && pl(t) < 0,
  );

  // Decision fatigue: 4th or later trade on the same calendar day.
  const perDay = new Map<string, number>();
  const fatigue = collect((t) => {
    const day = t.opened_at.slice(0, 10);
    const n = (perDay.get(day) ?? 0) + 1;
    perDay.set(day, n);
    return n >= 4 && pl(t) < 0;
  });

  // Loss aversion: no stop loss set, or a loss much larger than the average loss.
  const avgLossAbs = mean(losses.map((t) => Math.abs(pl(t))));
  const lossAversion = collect(
    (t) => pl(t) < 0 && (t.stop_loss === null || Math.abs(pl(t)) > avgLossAbs * 1.8),
  );

  // Recency bias: risk raised after a win.
  const recency = collect((t, i) => {
    if (i === 0) return false;
    const prev = list[i - 1];
    const risk = num(t.risk_percent);
    const prevRisk = num(prev.risk_percent);
    return pl(prev) > 0 && risk !== null && prevRisk !== null && risk > prevRisk * 1.5;
  });

  // Confirmation bias: same asset re-entered in the same direction right after a loss.
  const confirmation = collect((t, i) => {
    if (i === 0) return false;
    const prev = list[i - 1];
    return prev.asset === t.asset && prev.direction === t.direction && pl(prev) < 0;
  });

  // Gambler's fallacy: risk raised during an active losing streak.
  const gambler = collect((t, i) => {
    if (i < 2) return false;
    const streakLosing = pl(list[i - 1]) < 0 && pl(list[i - 2]) < 0;
    const risk = num(t.risk_percent);
    return streakLosing && risk !== null && risk > avgRisk * 1.3;
  });

  return [
    make("revenge", "Revenge trading", revenge,
      "Trades opened within an hour of a loss while raising risk above your own average — the classic signature of trying to win money back."),
    make("fear", "Fear cycles", fear,
      "Trades logged with a fear level of 7+ or a fearful emotional state; fear typically shows up as hesitation, early exits and skipped setups."),
    make("greed", "Greed cycles", greed,
      "Trades logged with greed 7+ or a greedy state, where targets get stretched beyond the original plan."),
    make("fomo", "FOMO", fomo,
      "Trades tagged fomo or impatient — entries taken because price moved, not because the setup triggered."),
    make("late", "Late entries", late,
      "High conviction entries that still produced sub-1R reward-to-risk, which usually means the entry came after the move had already run."),
    make("early", "Early exits", early,
      `Winners closed in under ${(avgHoldWin * 0.4).toFixed(1)}h while your average winner needs ${avgHoldWin.toFixed(1)}h to mature.`),
    make("holding-losers", "Holding losers", holdingLosers,
      "Losing trades held longer than your average winner — capital and attention tied up in positions already proven wrong."),
    make("cutting-winners", "Cutting winners", cuttingWinners,
      `Winning trades closed at well below your ${avgRr.toFixed(2)}R average payoff, truncating the right tail that funds the account.`),
    make("overconfidence", "Overconfidence", overconfidence,
      "Trades entered with confidence 8+ that still lost — conviction is not currently a reliable predictor of outcome."),
    make("fatigue", "Decision fatigue", fatigue,
      "Losing trades taken as the 4th or later trade of a single day, when decision quality typically degrades."),
    make("loss-aversion", "Loss aversion", lossAversion,
      "Losses taken without a stop loss recorded, or losses far larger than your typical loss — the pattern of refusing to accept a small loss."),
    make("recency", "Recency bias", recency,
      "Risk increased by 50%+ immediately after a winner, treating the last result as evidence about the next one."),
    make("confirmation", "Confirmation bias", confirmation,
      "Re-entering the same asset in the same direction directly after it produced a loss, defending the original thesis."),
    make("gambler", "Gambler's fallacy", gambler,
      "Risk increased during an active losing streak, as if a win were 'due'."),
  ];
}

/* ------------------------------------------------------------------ */
/* Section 5 — Strategy lab                                            */
/* ------------------------------------------------------------------ */

export type StrategyRow = {
  name: string;
  trades: number;
  winRate: number;
  profitFactor: number | null;
  expectancy: number;
  avgRr: number | null;
  maxDrawdown: number;
  consistency: number;
  execution: number;
  psychology: number;
  bestSession: string;
  worstSession: string;
  bestDay: string;
  bestMonth: string;
  netPnl: number;
  score: number;
};

function subScore(trades: Trade[], key: (t: Trade) => number | null, invert = false) {
  const vals = trades.map(key).filter((v): v is number => v !== null);
  if (!vals.length) return 50;
  const avg = mean(vals);
  const scaled = (avg / 10) * 100;
  return Math.round(Math.max(0, Math.min(100, invert ? 100 - scaled : scaled)));
}

function bestBucket(trades: Trade[], key: (t: Trade) => string | null, worst = false) {
  const rows = groupBy(trades, key).filter((r) => r.name !== "Unspecified");
  if (!rows.length) return "—";
  const sorted = [...rows].sort((a, b) => b.pnl - a.pnl);
  const row = worst ? sorted[sorted.length - 1] : sorted[0];
  return `${row.name} (${fmtMoney(row.pnl)})`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function strategyLab(trades: Trade[]): { rows: StrategyRow[]; best: StrategyRow | null } | null {
  if (trades.length < MIN_TRADES) return null;
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const name = t.strategy || "Unlabelled";
    groups.set(name, [...(groups.get(name) ?? []), t]);
  }

  const rows: StrategyRow[] = [...groups.entries()].map(([name, rowTrades]) => {
    const s = computeStats(rowTrades);
    const w = s.winRate / 100;
    const rrs = rowTrades.map((t) => num(t.rr_ratio)).filter((v): v is number => v !== null);
    const pnls = rowTrades.map(pl);
    const sd = stdev(pnls);
    const m = mean(pnls);
    const consistency = Math.round(
      Math.max(0, Math.min(100, sd === 0 ? 100 : 100 - Math.min(100, (sd / Math.max(1, Math.abs(m) || sd)) * 20))),
    );
    const execution = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          s.winRate * 0.5 +
            (rrs.length ? Math.min(50, mean(rrs) * 16) : 20) +
            (rowTrades.filter((t) => t.stop_loss !== null).length / rowTrades.length) * 10 -
            5,
        ),
      ),
    );
    const psychology = Math.round(
      (subScore(rowTrades, (t) => num(t.discipline_level)) +
        subScore(rowTrades, (t) => num(t.patience_level)) +
        subScore(rowTrades, (t) => num(t.fear_level), true) +
        subScore(rowTrades, (t) => num(t.greed_level), true)) /
        4,
    );
    const expectancy = r2(w * s.avgWin - (1 - w) * s.avgLoss);
    const row: StrategyRow = {
      name,
      trades: rowTrades.length,
      winRate: r2(s.winRate),
      profitFactor: Number.isFinite(s.profitFactor) ? r2(s.profitFactor) : null,
      expectancy,
      avgRr: rrs.length ? r2(mean(rrs)) : null,
      maxDrawdown: r2(Math.abs(maxDrawdownValue(rowTrades))),
      consistency,
      execution,
      psychology,
      bestSession: bestBucket(rowTrades, (t) => t.session),
      worstSession: bestBucket(rowTrades, (t) => t.session, true),
      bestDay: bestBucket(rowTrades, (t) => DAYS[new Date(t.opened_at).getDay()]),
      bestMonth: bestBucket(rowTrades, (t) => MONTHS[new Date(t.opened_at).getMonth()]),
      netPnl: r2(s.netPnl),
      score: 0,
    };
    row.score = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          (row.profitFactor ?? 0) * 12 +
            row.winRate * 0.25 +
            consistency * 0.2 +
            execution * 0.2 +
            psychology * 0.1 +
            (expectancy > 0 ? 10 : -10),
        ),
      ),
    );
    return row;
  });

  rows.sort((a, b) => b.score - a.score);
  const eligible = rows.filter((r) => r.trades >= 3 && r.netPnl > 0);
  return { rows, best: eligible[0] ?? null };
}

/* ------------------------------------------------------------------ */
/* Section 6 — Session intelligence                                    */
/* ------------------------------------------------------------------ */

export type SessionRow = {
  name: string;
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  avgRr: number | null;
};

export function sessionIntelligence(trades: Trade[]) {
  if (trades.length < MIN_TRADES) return null;
  const canonical = ["london", "new-york", "asia", "overlap", "sydney"];
  const sessions: SessionRow[] = canonical
    .map((key) => {
      const rows = trades.filter((t) => (t.session ?? "").toLowerCase() === key);
      if (!rows.length) return null;
      const s = computeStats(rows);
      const w = s.winRate / 100;
      const rrs = rows.map((t) => num(t.rr_ratio)).filter((v): v is number => v !== null);
      return {
        name: key === "new-york" ? "New York" : key.charAt(0).toUpperCase() + key.slice(1),
        trades: rows.length,
        netPnl: r2(s.netPnl),
        winRate: r2(s.winRate),
        expectancy: r2(w * s.avgWin - (1 - w) * s.avgLoss),
        avgRr: rrs.length ? r2(mean(rrs)) : null,
      } satisfies SessionRow;
    })
    .filter((r): r is SessionRow => r !== null);

  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const rows = trades.filter((t) => new Date(t.opened_at).getUTCHours() === hour);
    const s = rows.length ? computeStats(rows) : null;
    const rrs = rows.map((t) => num(t.rr_ratio)).filter((v): v is number => v !== null);
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      trades: rows.length,
      pnl: s ? r2(s.netPnl) : 0,
      winRate: s && rows.length ? r2(s.winRate) : 0,
      avgRr: rrs.length ? r2(mean(rrs)) : 0,
    };
  });

  const weekday = DAYS.map((name, idx) => {
    const rows = trades.filter((t) => new Date(t.opened_at).getDay() === idx);
    const s = rows.length ? computeStats(rows) : null;
    return {
      name: name.slice(0, 3),
      trades: rows.length,
      pnl: s ? r2(s.netPnl) : 0,
      winRate: s && rows.length ? r2(s.winRate) : 0,
    };
  });

  return { sessions, hourly, weekday };
}

/* ------------------------------------------------------------------ */
/* Section 7 — Market intelligence                                     */
/* ------------------------------------------------------------------ */

export type MarketRow = {
  name: string;
  trades: number;
  netPnl: number;
  winRate: number;
  expectancy: number;
  avgRisk: number | null;
  maxDrawdown: number;
  psychology: number;
};

export function marketIntelligence(trades: Trade[]): MarketRow[] | null {
  if (trades.length < MIN_TRADES) return null;
  const markets = ["forex", "crypto", "stocks", "dex", "futures", "options", "indices"];
  const present = new Set(trades.map((t) => (t.market || "other").toLowerCase()));
  const keys = [...new Set([...markets.filter((m) => present.has(m)), ...present])];

  return keys
    .map((key) => {
      const rows = trades.filter((t) => (t.market || "other").toLowerCase() === key);
      if (!rows.length) return null;
      const s = computeStats(rows);
      const w = s.winRate / 100;
      const risks = rows.map((t) => num(t.risk_percent)).filter((v): v is number => v !== null);
      return {
        name: key.charAt(0).toUpperCase() + key.slice(1),
        trades: rows.length,
        netPnl: r2(s.netPnl),
        winRate: r2(s.winRate),
        expectancy: r2(w * s.avgWin - (1 - w) * s.avgLoss),
        avgRisk: risks.length ? r2(mean(risks)) : null,
        maxDrawdown: r2(Math.abs(maxDrawdownValue(rows))),
        psychology: Math.round(
          (subScore(rows, (t) => num(t.discipline_level)) +
            subScore(rows, (t) => num(t.patience_level)) +
            subScore(rows, (t) => num(t.fear_level), true) +
            subScore(rows, (t) => num(t.greed_level), true)) /
            4,
        ),
      } satisfies MarketRow;
    })
    .filter((r): r is MarketRow => r !== null)
    .sort((a, b) => b.netPnl - a.netPnl);
}

/* ------------------------------------------------------------------ */
/* Section 8 — Trade replay                                            */
/* ------------------------------------------------------------------ */

export type ReplayStep = {
  phase: string;
  title: string;
  detail: string;
  tone: Rating;
};

export function tradeReplay(trade: Trade, history: Trade[]): ReplayStep[] {
  const profit = pl(trade);
  const entry = num(trade.entry_price);
  const exit = num(trade.exit_price);
  const stop = num(trade.stop_loss);
  const target = num(trade.take_profit);
  const hold = durationHours(trade);
  const rr = num(trade.rr_ratio);
  const peers = history.filter((t) => t.id !== trade.id);
  const avgRr = mean(peers.map((t) => num(t.rr_ratio)).filter((v): v is number => v !== null));
  const avgHoldWin = mean(
    peers.filter((t) => pl(t) > 0).map(durationHours).filter((v): v is number => v !== null),
  );

  const steps: ReplayStep[] = [];

  steps.push({
    phase: "Before entry",
    title: `${trade.strategy || "Unlabelled setup"} on ${trade.asset}`,
    detail: [
      `Planned as a ${trade.direction} in the ${trade.session || "unspecified"} session on the ${trade.timeframe || "unspecified"} timeframe.`,
      trade.confidence_level !== null ? `Confidence logged at ${trade.confidence_level}/10.` : null,
      trade.psychology_before ? `Mindset before: "${trade.psychology_before}"` : null,
      trade.risk_percent !== null ? `Risk allocated: ${Number(trade.risk_percent).toFixed(2)}% of capital.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    tone: trade.stop_loss === null ? "poor" : "good",
  });

  steps.push({
    phase: "Entry",
    title: entry !== null ? `Filled at ${entry}` : "Entry price not recorded",
    detail: [
      stop !== null ? `Stop at ${stop}.` : "No stop loss recorded — the downside was undefined at entry.",
      target !== null ? `Target at ${target}.` : "No take profit recorded.",
      rr !== null ? `Planned reward-to-risk ${rr.toFixed(2)}R versus your ${avgRr ? avgRr.toFixed(2) : "—"}R average.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    tone: stop === null ? "poor" : rr !== null && avgRr && rr >= avgRr ? "excellent" : "average",
  });

  steps.push({
    phase: "Management",
    title: hold === null ? "Hold time not recorded" : `Held for ${hold.toFixed(1)} hours`,
    detail: [
      hold !== null && avgHoldWin
        ? hold < avgHoldWin * 0.5
          ? `That is less than half the ${avgHoldWin.toFixed(1)}h your winners usually need.`
          : hold > avgHoldWin * 2
            ? `That is more than double the ${avgHoldWin.toFixed(1)}h your winners usually need.`
            : `In line with the ${avgHoldWin.toFixed(1)}h your winners usually need.`
        : null,
      trade.emotional_state ? `Emotional state logged: ${trade.emotional_state}.` : null,
      trade.discipline_level !== null ? `Discipline rated ${trade.discipline_level}/10.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    tone:
      hold !== null && avgHoldWin && (hold < avgHoldWin * 0.4 || hold > avgHoldWin * 2.5)
        ? "average"
        : "good",
  });

  steps.push({
    phase: "Exit",
    title: `${profit >= 0 ? "Closed in profit" : "Closed at a loss"} — ${fmtMoney(profit)}`,
    detail: [
      exit !== null ? `Exit price ${exit}.` : "Exit price not recorded.",
      target !== null && exit !== null
        ? trade.direction === "long"
          ? exit >= target
            ? "Target was reached."
            : "Closed before the planned target."
          : exit <= target
            ? "Target was reached."
            : "Closed before the planned target."
        : null,
      trade.psychology_after ? `Mindset after: "${trade.psychology_after}"` : null,
    ]
      .filter(Boolean)
      .join(" "),
    tone: profit >= 0 ? "excellent" : "poor",
  });

  const mistakes: string[] = [];
  if (stop === null) mistakes.push("No stop loss recorded, so risk was undefined.");
  if (target === null) mistakes.push("No take profit recorded, so the exit was discretionary.");
  if (rr !== null && avgRr && rr < avgRr * 0.6)
    mistakes.push(`Reward-to-risk (${rr.toFixed(2)}R) was well below your ${avgRr.toFixed(2)}R average.`);
  if (profit < 0 && (trade.confidence_level ?? 0) >= 8)
    mistakes.push("High conviction did not translate into a positive outcome — check what the conviction was based on.");
  if (["revenge", "fomo", "impatient", "greedy"].includes(trade.emotional_state ?? ""))
    mistakes.push(`Emotional state "${trade.emotional_state}" was logged at the time of the trade.`);
  if (profit > 0 && hold !== null && avgHoldWin && hold < avgHoldWin * 0.4)
    mistakes.push("The winner was closed much earlier than your winners usually mature.");

  steps.push({
    phase: "Mistakes",
    title: mistakes.length ? `${mistakes.length} process issues detected` : "No process issues detected",
    detail: mistakes.length
      ? mistakes.join(" ")
      : "Every rule your journal can verify was respected on this trade.",
    tone: mistakes.length ? (mistakes.length > 2 ? "poor" : "average") : "excellent",
  });

  const alternatives: string[] = [];
  if (rr !== null && avgRr && rr < avgRr)
    alternatives.push(`Holding to your average ${avgRr.toFixed(2)}R would have changed the payoff on this idea.`);
  if (stop === null) alternatives.push("Defining the stop before entry would have capped the outcome to a known loss.");
  if (profit < 0 && trade.risk_percent !== null && Number(trade.risk_percent) > 1)
    alternatives.push(
      `Risking 1% instead of ${Number(trade.risk_percent).toFixed(2)}% would have reduced this loss to ${fmtMoney(
        (profit / Number(trade.risk_percent)) * 1,
      )}.`,
    );
  if (!alternatives.length) alternatives.push("The recorded plan and the execution match; keep repeating this process.");

  steps.push({
    phase: "Alternative decisions",
    title: "What the journal says could have been done differently",
    detail: alternatives.join(" "),
    tone: "average",
  });

  const expected =
    rr !== null && peers.length
      ? `Trades in your journal with a similar planned RR (${rr.toFixed(2)}R ±0.5R) averaged ${fmtMoney(
          mean(
            peers
              .filter((t) => {
                const v = num(t.rr_ratio);
                return v !== null && Math.abs(v - rr) <= 0.5;
              })
              .map(pl),
          ) || 0,
        )}.`
      : "Log planned RR on more trades to compare this outcome against similar setups.";

  steps.push({
    phase: "Expected outcome",
    title: "Historical comparison, not a forecast",
    detail: `${expected} This compares the trade to your own history and says nothing about future prices.`,
    tone: "neutral",
  });

  return steps;
}

/* ------------------------------------------------------------------ */
/* Section 9 — Benchmark                                               */
/* ------------------------------------------------------------------ */

export type BenchmarkRow = {
  key: string;
  label: string;
  value: number;
  display: string;
  percentile: number;
  tier: "Beginner" | "Intermediate" | "Professional" | "Institutional";
  bands: { beginner: number; intermediate: number; professional: number; institutional: number };
  explanation: string;
};

/** Reference bands are published industry study levels, not other users' data. */
function tierFor(value: number, b: BenchmarkRow["bands"]): { tier: BenchmarkRow["tier"]; percentile: number } {
  const points: [number, number][] = [
    [b.beginner, 30],
    [b.intermediate, 55],
    [b.professional, 78],
    [b.institutional, 95],
  ];
  let pct = 10;
  if (value <= points[0][0]) pct = Math.max(2, (value / (points[0][0] || 1)) * 30);
  else {
    for (let i = 0; i < points.length - 1; i++) {
      const [lo, loP] = points[i];
      const [hi, hiP] = points[i + 1];
      if (value <= hi) {
        pct = loP + ((value - lo) / (hi - lo || 1)) * (hiP - loP);
        break;
      }
      pct = 97;
    }
  }
  pct = Math.max(1, Math.min(99, pct));
  const tier: BenchmarkRow["tier"] =
    value >= b.institutional
      ? "Institutional"
      : value >= b.professional
        ? "Professional"
        : value >= b.intermediate
          ? "Intermediate"
          : "Beginner";
  return { tier, percentile: Math.round(pct) };
}

export function benchmark(trades: Trade[]): BenchmarkRow[] | null {
  if (trades.length < MIN_TRADES) return null;
  const s = computeStats(trades);
  const metrics = performanceMetrics(trades);
  const find = (key: string) => metrics?.find((m) => m.key === key)?.value ?? 0;
  const behaviours = behaviorPatterns(trades) ?? [];
  const flagged = behaviours.filter((b) => b.detected).reduce((acc, b) => acc + b.count, 0);
  const disciplineScore = Math.max(0, 100 - (flagged / trades.length) * 100);
  const stopCoverage = (trades.filter((t) => t.stop_loss !== null).length / trades.length) * 100;
  const psych =
    (subScore(trades, (t) => num(t.discipline_level)) +
      subScore(trades, (t) => num(t.patience_level)) +
      subScore(trades, (t) => num(t.fear_level), true) +
      subScore(trades, (t) => num(t.greed_level), true)) /
    4;

  const rows: Omit<BenchmarkRow, "percentile" | "tier">[] = [
    {
      key: "execution",
      label: "Execution",
      value: r2((s.winRate * 0.4 + stopCoverage * 0.3 + Math.min(100, (find("sqn") ?? 0) * 25) * 0.3)),
      display: "",
      bands: { beginner: 35, intermediate: 50, professional: 65, institutional: 80 },
      explanation: "Blend of win rate, stop-loss discipline and system quality (SQN).",
    },
    {
      key: "risk",
      label: "Risk management",
      value: r2(Math.max(0, Math.min(100, 50 + (find("mar") ?? 0) * 12 + stopCoverage * 0.3 - (find("ulcer") ?? 0) * 2))),
      display: "",
      bands: { beginner: 35, intermediate: 52, professional: 68, institutional: 82 },
      explanation: "MAR ratio, ulcer index and stop-loss coverage combined.",
    },
    {
      key: "psychology",
      label: "Psychology",
      value: r2((psych + disciplineScore) / 2),
      display: "",
      bands: { beginner: 40, intermediate: 55, professional: 70, institutional: 85 },
      explanation: "Logged mindset ratings against the behavioural flags detected in your history.",
    },
    {
      key: "consistency",
      label: "Consistency",
      value: r2(Math.max(0, Math.min(100, 100 - Math.min(100, (find("cv") ?? 0) * 12)))),
      display: "",
      bands: { beginner: 30, intermediate: 48, professional: 65, institutional: 80 },
      explanation: "Derived from the coefficient of variation of your trade results.",
    },
    {
      key: "profitability",
      label: "Profitability",
      value: r2(Math.max(0, Math.min(100, 40 + (find("omega") ?? 0) * 22 + (s.netPnl > 0 ? 12 : -18)))),
      display: "",
      bands: { beginner: 35, intermediate: 52, professional: 70, institutional: 85 },
      explanation: "Omega ratio and net profitability of the journal to date.",
    },
  ];

  return rows.map((row) => {
    const { tier, percentile: pct } = tierFor(row.value, row.bands);
    return { ...row, display: `${row.value.toFixed(0)}/100`, percentile: 100 - pct, tier };
  });
}

/* ------------------------------------------------------------------ */
/* Section 10 — Portfolio analytics                                    */
/* ------------------------------------------------------------------ */

export type Allocation = { name: string; trades: number; exposure: number; share: number; pnl: number };

export function portfolioAnalytics(trades: Trade[]) {
  if (trades.length < MIN_TRADES) return null;

  const exposureOf = (t: Trade) => {
    const size = num(t.position_size);
    const entry = num(t.entry_price);
    if (size !== null && entry !== null) return Math.abs(size * entry);
    const risk = num(t.risk_percent);
    if (risk !== null) return (risk / 100) * estimatedCapital(trades);
    return Math.abs(pl(t)) || 1;
  };

  const bucket = (key: (t: Trade) => string): Allocation[] => {
    const map = new Map<string, Allocation>();
    for (const t of trades) {
      const name = key(t) || "Unspecified";
      const row = map.get(name) ?? { name, trades: 0, exposure: 0, share: 0, pnl: 0 };
      row.trades += 1;
      row.exposure += exposureOf(t);
      row.pnl += pl(t);
      map.set(name, row);
    }
    const total = [...map.values()].reduce((acc, r) => acc + r.exposure, 0) || 1;
    return [...map.values()]
      .map((r) => ({
        ...r,
        exposure: r2(r.exposure),
        pnl: r2(r.pnl),
        share: r2((r.exposure / total) * 100),
      }))
      .sort((a, b) => b.share - a.share);
  };

  const byAsset = bucket((t) => t.asset);
  const byMarket = bucket((t) => t.market);
  const bySector = bucket((t) => t.setup_type || t.strategy || "Unclassified");

  const hhi = byAsset.reduce((acc, r) => acc + (r.share / 100) ** 2, 0);
  const diversification = Math.round(Math.max(0, Math.min(100, (1 - hhi) * 100)));
  const concentration = Math.round(hhi * 100);
  const topShare = byAsset[0]?.share ?? 0;
  const totalExposure = r2(byAsset.reduce((acc, r) => acc + r.exposure, 0));

  // Correlation of each asset's P/L sequence against the whole book.
  const dates = [...new Set(trades.map((t) => t.opened_at.slice(0, 10)))].sort();
  const seriesFor = (rows: Trade[]) =>
    dates.map((d) => rows.filter((t) => t.opened_at.slice(0, 10) === d).reduce((s, t) => s + pl(t), 0));
  const topAssets = byAsset.slice(0, 8).map((a) => a.name);
  const seriesMap = new Map(topAssets.map((a) => [a, seriesFor(trades.filter((t) => t.asset === a))]));

  const corr = (xs: number[], ys: number[]) => {
    const n = xs.length;
    if (n < 3) return 0;
    const mx = mean(xs);
    const my = mean(ys);
    const cov = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
    const sx = Math.sqrt(xs.reduce((acc, x) => acc + (x - mx) ** 2, 0));
    const sy = Math.sqrt(ys.reduce((acc, y) => acc + (y - my) ** 2, 0));
    return sx && sy ? r2(cov / (sx * sy)) : 0;
  };

  const matrix = topAssets.map((a) => ({
    name: a,
    cells: topAssets.map((b) => ({
      name: b,
      value: a === b ? 1 : corr(seriesMap.get(a) ?? [], seriesMap.get(b) ?? []),
    })),
  }));

  return {
    byAsset,
    byMarket,
    bySector,
    matrix,
    diversification,
    concentration,
    topShare,
    totalExposure,
    hhi: r2(hhi),
  };
}
