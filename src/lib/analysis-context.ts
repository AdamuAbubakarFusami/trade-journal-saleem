import { computeStats, groupBy, type Trade } from "./trades";

const num = (v: unknown, d = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(d)) : null;
};

const avg = (v: number[]) =>
  v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)) : null;

export function expectancy(trades: Trade[]) {
  if (!trades.length) return 0;
  const s = computeStats(trades);
  const w = s.winRate / 100;
  return Number((w * s.avgWin - (1 - w) * s.avgLoss).toFixed(2));
}

export function maxDrawdown(trades: Trade[]) {
  const s = computeStats(trades);
  let peak = 0;
  let dd = 0;
  for (const p of s.equityCurve) {
    peak = Math.max(peak, p.equity);
    dd = Math.min(dd, p.equity - peak);
  }
  return Number(dd.toFixed(2));
}

function psychologyProfile(trades: Trade[]) {
  return {
    avgFear: avg(trades.map((t) => Number(t.fear_level)).filter(Number.isFinite)),
    avgGreed: avg(trades.map((t) => Number(t.greed_level)).filter(Number.isFinite)),
    avgDiscipline: avg(trades.map((t) => Number(t.discipline_level)).filter(Number.isFinite)),
    avgPatience: avg(trades.map((t) => Number(t.patience_level)).filter(Number.isFinite)),
    avgConfidence: avg(trades.map((t) => Number(t.confidence_level)).filter(Number.isFinite)),
  };
}

function byDayOfWeek(trades: Trade[]) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return groupBy(trades, (t) => names[new Date(t.opened_at).getDay()]);
}

function bucketed(trades: Trade[], label: (t: Trade) => string | null) {
  return groupBy(trades, label).map((g) => ({
    name: g.name,
    trades: g.trades,
    pnl: g.pnl,
    winRate: num(g.winRate, 1),
  }));
}

/** Aggregated historical picture used to ground every AI report. */
export function buildHistory(trades: Trade[]) {
  const s = computeStats(trades);
  return {
    totalTrades: s.total,
    wins: s.wins,
    losses: s.losses,
    winRate: num(s.winRate, 1),
    lossRate: num(s.lossRate, 1),
    netPnl: num(s.netPnl),
    avgRr: num(s.avgRr),
    avgWin: num(s.avgWin),
    avgLoss: num(s.avgLoss),
    profitFactor: Number.isFinite(s.profitFactor) ? num(s.profitFactor) : null,
    expectancy: expectancy(trades),
    maxDrawdown: maxDrawdown(trades),
    currentStreak: s.streak,
    bestTrade: s.best ? { asset: s.best.asset, pnl: num(s.best.profit_loss) } : null,
    worstTrade: s.worst ? { asset: s.worst.asset, pnl: num(s.worst.profit_loss) } : null,
    psychology: psychologyProfile(trades),
    byStrategy: bucketed(trades, (t) => t.strategy).slice(0, 10),
    bySetup: bucketed(trades, (t) => t.setup_type).slice(0, 10),
    bySession: bucketed(trades, (t) => t.session),
    byMarket: bucketed(trades, (t) => t.market),
    byTimeframe: bucketed(trades, (t) => t.timeframe).slice(0, 10),
    byEmotion: bucketed(trades, (t) => t.emotional_state).slice(0, 10),
    byDirection: bucketed(trades, (t) => t.direction),
    byDayOfWeek: byDayOfWeek(trades).map((g) => ({
      name: g.name,
      trades: g.trades,
      pnl: g.pnl,
      winRate: num(g.winRate, 1),
    })),
    byMonth: bucketed(trades, (t) => t.opened_at.slice(0, 7)).slice(0, 12),
    highFear: summarizeSlice(trades.filter((t) => Number(t.fear_level) >= 7)),
    lowConfidence: summarizeSlice(trades.filter((t) => Number(t.confidence_level) <= 4)),
    highRr: summarizeSlice(trades.filter((t) => Number(t.rr_ratio) >= 3)),
    bigRisk: summarizeSlice(trades.filter((t) => Number(t.risk_percent) > 2)),
  };
}

function summarizeSlice(trades: Trade[]) {
  if (!trades.length) return { trades: 0, winRate: null, pnl: 0 };
  const s = computeStats(trades);
  return { trades: s.total, winRate: num(s.winRate, 1), pnl: num(s.netPnl) };
}

export function serializeTrade(t: Trade) {
  return {
    asset: t.asset,
    market: t.market,
    direction: t.direction,
    date: t.opened_at,
    closedAt: t.closed_at,
    entryPrice: num(t.entry_price, 5),
    exitPrice: num(t.exit_price, 5),
    stopLoss: num(t.stop_loss, 5),
    takeProfit: num(t.take_profit, 5),
    positionSize: num(t.position_size, 4),
    riskPercent: num(t.risk_percent),
    rrRatio: num(t.rr_ratio),
    profitLoss: num(t.profit_loss),
    strategy: t.strategy,
    setupType: t.setup_type,
    session: t.session,
    timeframe: t.timeframe,
    confidenceLevel: t.confidence_level,
    hasScreenshot: Boolean(t.screenshot_url),
    notes: t.notes?.slice(0, 800) ?? null,
    emotion: t.emotional_state,
    fearLevel: t.fear_level,
    greedLevel: t.greed_level,
    disciplineScore: t.discipline_level,
    patienceScore: t.patience_level,
    psychologyBefore: t.psychology_before?.slice(0, 500) ?? null,
    psychologyAfter: t.psychology_after?.slice(0, 500) ?? null,
  };
}

export function recentTrades(trades: Trade[], limit = 25) {
  return [...trades]
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())
    .slice(0, limit)
    .map(serializeTrade);
}

export function withinDays(trades: Trade[], days: number) {
  const cutoff = Date.now() - days * 86400000;
  return trades.filter((t) => new Date(t.opened_at).getTime() >= cutoff);
}

/** Caps payload size so the model never receives an oversized context. */
export function packContext(payload: unknown) {
  const json = JSON.stringify(payload);
  return json.length > 60000 ? json.slice(0, 60000) : json;
}
