export type Trade = {
  id: string;
  user_id: string;
  asset: string;
  market: string;
  direction: string;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  position_size: number | null;
  risk_percent: number | null;
  profit_loss: number;
  rr_ratio: number | null;
  strategy: string | null;
  setup_type: string | null;
  session: string | null;
  timeframe: string | null;
  confidence_level: number | null;
  psychology_before: string | null;
  psychology_after: string | null;
  emotional_state: string | null;
  fear_level: number | null;
  greed_level: number | null;
  discipline_level: number | null;
  patience_level: number | null;
  notes: string | null;
  screenshot_url: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const MARKETS = ["forex", "crypto", "stocks", "options", "dex", "indices"] as const;
export const DIRECTIONS = ["long", "short"] as const;
export const SESSIONS = ["asia", "london", "new-york", "sydney", "overlap"] as const;
export const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"] as const;
export const EMOTIONS = [
  "calm",
  "confident",
  "fearful",
  "greedy",
  "impatient",
  "revenge",
  "fomo",
  "disciplined",
] as const;

export const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const pct = (n: number) => `${n.toFixed(1)}%`;

export type Stats = ReturnType<typeof computeStats>;

export function computeStats(trades: Trade[]) {
  const total = trades.length;
  const wins = trades.filter((t) => Number(t.profit_loss) > 0);
  const losses = trades.filter((t) => Number(t.profit_loss) < 0);
  const netPnl = trades.reduce((s, t) => s + Number(t.profit_loss || 0), 0);
  const rrValues = trades.map((t) => Number(t.rr_ratio)).filter((v) => Number.isFinite(v) && v > 0);
  const grossWin = wins.reduce((s, t) => s + Number(t.profit_loss), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.profit_loss), 0));

  const sorted = [...trades].sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
  );

  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = Number(sorted[i].profit_loss);
    if (p === 0) break;
    if (streak === 0) streak = p > 0 ? 1 : -1;
    else if (streak > 0 && p > 0) streak += 1;
    else if (streak < 0 && p < 0) streak -= 1;
    else break;
  }

  const best = trades.reduce<Trade | null>(
    (acc, t) => (!acc || Number(t.profit_loss) > Number(acc.profit_loss) ? t : acc),
    null,
  );
  const worst = trades.reduce<Trade | null>(
    (acc, t) => (!acc || Number(t.profit_loss) < Number(acc.profit_loss) ? t : acc),
    null,
  );

  let running = 0;
  const equityCurve = sorted.map((t, i) => {
    running += Number(t.profit_loss || 0);
    return { index: i + 1, date: t.opened_at.slice(0, 10), equity: Number(running.toFixed(2)) };
  });

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: total ? (wins.length / total) * 100 : 0,
    lossRate: total ? (losses.length / total) * 100 : 0,
    netPnl,
    avgRr: rrValues.length ? rrValues.reduce((s, v) => s + v, 0) / rrValues.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    best,
    worst,
    streak,
    equityCurve,
  };
}

export function groupBy(trades: Trade[], key: (t: Trade) => string | null) {
  const map = new Map<string, { name: string; trades: number; pnl: number; wins: number }>();
  for (const t of trades) {
    const name = key(t) || "Unspecified";
    const entry = map.get(name) ?? { name, trades: 0, pnl: 0, wins: 0 };
    entry.trades += 1;
    entry.pnl += Number(t.profit_loss || 0);
    if (Number(t.profit_loss) > 0) entry.wins += 1;
    map.set(name, entry);
  }
  return [...map.values()]
    .map((e) => ({ ...e, pnl: Number(e.pnl.toFixed(2)), winRate: (e.wins / e.trades) * 100 }))
    .sort((a, b) => b.pnl - a.pnl);
}

export function toCsv(trades: Trade[]) {
  const cols: (keyof Trade)[] = [
    "opened_at",
    "asset",
    "market",
    "direction",
    "entry_price",
    "exit_price",
    "stop_loss",
    "take_profit",
    "position_size",
    "risk_percent",
    "profit_loss",
    "rr_ratio",
    "strategy",
    "setup_type",
    "session",
    "timeframe",
    "confidence_level",
    "emotional_state",
    "psychology_before",
    "psychology_after",
    "notes",
  ];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...trades.map((t) => cols.map((c) => escape(t[c])).join(","))].join("\n");
}
