import { computeStats, groupBy, type Trade } from "./trades";

const r2 = (n: number) => Number(n.toFixed(2));
const sorted = (trades: Trade[]) =>
  [...trades].sort((a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime());

const pl = (t: Trade) => Number(t.profit_loss || 0);

function mean(v: number[]) {
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}

function stdev(v: number[]) {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Per-trade Sharpe: mean P/L divided by the volatility of P/L. */
export function sharpeRatio(trades: Trade[]) {
  const v = trades.map(pl);
  const sd = stdev(v);
  return sd ? r2(mean(v) / sd) : null;
}

/** Sortino uses downside deviation only — it ignores upside volatility. */
export function sortinoRatio(trades: Trade[]) {
  const v = trades.map(pl);
  const downside = v.filter((x) => x < 0);
  if (!v.length || !downside.length) return null;
  const dd = Math.sqrt(downside.reduce((s, x) => s + x ** 2, 0) / downside.length);
  return dd ? r2(mean(v) / dd) : null;
}

export function drawdownCurve(trades: Trade[]) {
  let equity = 0;
  let peak = 0;
  return sorted(trades).map((t, i) => {
    equity += pl(t);
    peak = Math.max(peak, equity);
    return {
      index: i + 1,
      date: t.opened_at.slice(0, 10),
      equity: r2(equity),
      drawdown: r2(equity - peak),
    };
  });
}

export function maxDrawdownValue(trades: Trade[]) {
  return drawdownCurve(trades).reduce((min, p) => Math.min(min, p.drawdown), 0);
}

export function recoveryFactor(trades: Trade[]) {
  const dd = Math.abs(maxDrawdownValue(trades));
  const net = computeStats(trades).netPnl;
  return dd ? r2(net / dd) : null;
}

export function streaks(trades: Trade[]) {
  let win = 0;
  let loss = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const t of sorted(trades)) {
    const p = pl(t);
    if (p > 0) {
      curWin += 1;
      curLoss = 0;
    } else if (p < 0) {
      curLoss += 1;
      curWin = 0;
    } else {
      curWin = 0;
      curLoss = 0;
    }
    win = Math.max(win, curWin);
    loss = Math.max(loss, curLoss);
  }
  return { longestWinStreak: win, longestLossStreak: loss };
}

/** Average holding time in hours, computed only from trades that have a close time. */
export function avgDurationHours(trades: Trade[]) {
  const durations = trades
    .filter((t) => t.closed_at)
    .map((t) => (new Date(t.closed_at!).getTime() - new Date(t.opened_at).getTime()) / 3600000)
    .filter((h) => Number.isFinite(h) && h >= 0);
  return durations.length ? r2(mean(durations)) : null;
}

export function expectancyPerTrade(trades: Trade[]) {
  if (!trades.length) return 0;
  const s = computeStats(trades);
  const w = s.winRate / 100;
  return r2(w * s.avgWin - (1 - w) * s.avgLoss);
}

function periodKey(iso: string, mode: "month" | "quarter" | "year") {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  if (mode === "year") return `${y}`;
  if (mode === "quarter") return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function growthByPeriod(trades: Trade[], mode: "month" | "quarter" | "year") {
  const buckets = groupBy(trades, (t) => periodKey(t.opened_at, mode));
  return buckets
    .map((b) => ({ ...b, winRate: r2(b.winRate) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Rolling win rate over a fixed window — used for the win-rate trend chart. */
export function winRateTrend(trades: Trade[], window = 10) {
  const list = sorted(trades);
  return list.map((t, i) => {
    const slice = list.slice(Math.max(0, i - window + 1), i + 1);
    const wins = slice.filter((x) => pl(x) > 0).length;
    return {
      index: i + 1,
      date: t.opened_at.slice(0, 10),
      winRate: r2((wins / slice.length) * 100),
    };
  });
}

function histogram(values: number[], edges: number[], labels: string[]) {
  const counts = labels.map((label) => ({ label, count: 0 }));
  for (const v of values) {
    let bucket = edges.findIndex((e) => v < e);
    if (bucket === -1) bucket = labels.length - 1;
    counts[bucket].count += 1;
  }
  return counts;
}

export function riskDistribution(trades: Trade[]) {
  const values = trades.map((t) => Number(t.risk_percent)).filter(Number.isFinite);
  return histogram(
    values,
    [0.5, 1, 2, 3, 5],
    ["<0.5%", "0.5–1%", "1–2%", "2–3%", "3–5%", "5%+"],
  );
}

export function rrDistribution(trades: Trade[]) {
  const values = trades.map((t) => Number(t.rr_ratio)).filter((v) => Number.isFinite(v) && v > 0);
  return histogram(values, [1, 1.5, 2, 3, 5], ["<1R", "1–1.5R", "1.5–2R", "2–3R", "3–5R", "5R+"]);
}

export function pnlDistribution(trades: Trade[]) {
  const wins = trades.map(pl).filter((v) => v > 0);
  const losses = trades.map(pl).filter((v) => v < 0).map(Math.abs);
  const bucket = (values: number[]) =>
    histogram(values, [50, 100, 250, 500, 1000], ["<50", "50–100", "100–250", "250–500", "500–1k", "1k+"]);
  return { wins: bucket(wins), losses: bucket(losses) };
}

/** Emotion × outcome grid used for the emotion heatmap. */
export function emotionHeatmap(trades: Trade[]) {
  return groupBy(trades, (t) => t.emotional_state).map((g) => ({
    name: g.name,
    trades: g.trades,
    pnl: g.pnl,
    winRate: r2(g.winRate),
    avgPnl: r2(g.pnl / g.trades),
  }));
}

/** Lower spread of risk % and P/L means a more repeatable process. 0–100. */
export function consistencyScore(trades: Trade[]) {
  if (trades.length < 5) return null;
  const risks = trades.map((t) => Number(t.risk_percent)).filter(Number.isFinite);
  const riskPenalty = risks.length > 1 ? Math.min(40, stdev(risks) * 20) : 0;
  const pnls = trades.map(pl);
  const m = Math.abs(mean(pnls)) || 1;
  const pnlPenalty = Math.min(40, (stdev(pnls) / m) * 8);
  return Math.round(Math.max(0, 100 - riskPenalty - pnlPenalty));
}

export function disciplineScore(trades: Trade[]) {
  const values = trades.map((t) => Number(t.discipline_level)).filter(Number.isFinite);
  return values.length ? Math.round(mean(values) * 10) : null;
}

/** Every deterministic metric the AI is allowed to cite. */
export function quantMetrics(trades: Trade[]) {
  const s = computeStats(trades);
  return {
    totalTrades: s.total,
    winRate: r2(s.winRate),
    lossRate: r2(s.lossRate),
    netPnl: r2(s.netPnl),
    avgRr: r2(s.avgRr),
    avgWin: r2(s.avgWin),
    avgLoss: r2(s.avgLoss),
    profitFactor: Number.isFinite(s.profitFactor) ? r2(s.profitFactor) : null,
    expectancy: expectancyPerTrade(trades),
    sharpeRatio: sharpeRatio(trades),
    sortinoRatio: sortinoRatio(trades),
    recoveryFactor: recoveryFactor(trades),
    maxDrawdown: r2(maxDrawdownValue(trades)),
    ...streaks(trades),
    avgDurationHours: avgDurationHours(trades),
    consistencyScore: consistencyScore(trades),
    disciplineScore: disciplineScore(trades),
    monthlyGrowth: growthByPeriod(trades, "month").slice(-12),
    quarterlyGrowth: growthByPeriod(trades, "quarter").slice(-8),
    yearlyGrowth: growthByPeriod(trades, "year").slice(-5),
    riskDistribution: riskDistribution(trades),
    rrDistribution: rrDistribution(trades),
    emotionPerformance: emotionHeatmap(trades),
  };
}
