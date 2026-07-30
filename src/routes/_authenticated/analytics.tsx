import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/analysis-blocks";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrades } from "@/hooks/use-trades";
import {
  drawdownCurve,
  growthByPeriod,
  pnlDistribution,
  quantMetrics,
  riskDistribution,
  rrDistribution,
  emotionHeatmap,
  winRateTrend,
} from "@/lib/quant";
import { computeStats, groupBy, money, pct } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — SaleemJournal" },
      { name: "description", content: "Break down your edge by strategy, session and market." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Analytics,
});

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

function PnlBars({ data }: { data: { name: string; pnl: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={54} />
        <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} />
        <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
          {data.map((d) => (
            <Cell
              key={d.name}
              fill={d.pnl >= 0 ? "var(--color-success)" : "var(--color-destructive)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CountBars({
  data,
  color = "var(--color-primary)",
}: {
  data: { label: string; count: number }[];
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={40} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Analytics() {
  const { data: trades, isLoading } = useTrades();
  const list = useMemo(() => trades ?? [], [trades]);
  const stats = useMemo(() => computeStats(list), [list]);
  const quant = useMemo(() => quantMetrics(list), [list]);

  const byStrategy = useMemo(() => groupBy(list, (t) => t.strategy), [list]);
  const bySession = useMemo(() => groupBy(list, (t) => t.session), [list]);
  const byMarket = useMemo(() => groupBy(list, (t) => t.market), [list]);
  const byTimeframe = useMemo(() => groupBy(list, (t) => t.timeframe), [list]);
  const drawdown = useMemo(() => drawdownCurve(list), [list]);
  const winTrend = useMemo(() => winRateTrend(list), [list]);
  const monthly = useMemo(() => growthByPeriod(list, "month"), [list]);
  const emotions = useMemo(() => emotionHeatmap(list), [list]);
  const risks = useMemo(() => riskDistribution(list), [list]);
  const rrs = useMemo(() => rrDistribution(list), [list]);
  const pnls = useMemo(() => pnlDistribution(list), [list]);

  const winLoss = [
    { name: "Wins", value: stats.wins },
    { name: "Losses", value: stats.losses },
  ];

  if (isLoading) {
    return (
      <AppShell title="Analytics" description="Where your edge really comes from">
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!stats.total) {
    return (
      <AppShell title="Analytics" description="Where your edge really comes from">
        <EmptyState hint="Log a few trades and your full analytics engine unlocks here." />
      </AppShell>
    );
  }

  const cards = [
    { label: "Profit factor", value: quant.profitFactor ?? "∞" },
    { label: "Expectancy", value: money(quant.expectancy) },
    { label: "Sharpe ratio", value: quant.sharpeRatio ?? "—" },
    { label: "Sortino ratio", value: quant.sortinoRatio ?? "—" },
    { label: "Recovery factor", value: quant.recoveryFactor ?? "—" },
    { label: "Max drawdown", value: money(quant.maxDrawdown) },
    { label: "Longest win streak", value: quant.longestWinStreak },
    { label: "Longest loss streak", value: quant.longestLossStreak },
    { label: "Average win", value: money(stats.avgWin) },
    { label: "Average loss", value: money(stats.avgLoss) },
    {
      label: "Avg duration",
      value: quant.avgDurationHours !== null ? `${quant.avgDurationHours}h` : "—",
    },
    { label: "Consistency score", value: quant.consistencyScore ?? "—" },
  ];

  return (
    <AppShell title="Analytics" description="Where your edge really comes from">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((s) => (
          <div key={s.label} className="surface-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="num mt-2 text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Drawdown curve">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdown}>
              <defs>
                <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={54} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-destructive)"
                fill="url(#ddFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Win rate trend (rolling 10)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={winTrend}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={11} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="var(--color-primary)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Monthly P/L">
          <PnlBars data={monthly} />
        </Panel>
        <Panel title="P/L by strategy">
          <PnlBars data={byStrategy} />
        </Panel>
        <Panel title="P/L by session">
          <PnlBars data={bySession} />
        </Panel>
        <Panel title="P/L by market">
          <PnlBars data={byMarket} />
        </Panel>
        <Panel title="Risk % distribution">
          <CountBars data={risks} />
        </Panel>
        <Panel title="RR distribution">
          <CountBars data={rrs} />
        </Panel>
        <Panel title="Profit distribution">
          <CountBars data={pnls.wins} color="var(--color-success)" />
        </Panel>
        <Panel title="Loss distribution">
          <CountBars data={pnls.losses} color="var(--color-destructive)" />
        </Panel>
        <Panel title="Win / loss split">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={winLoss} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95}>
                <Cell fill="var(--color-success)" />
                <Cell fill="var(--color-destructive)" />
              </Pie>
              <Legend />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Emotion performance">
          <PnlBars data={emotions} />
        </Panel>
      </div>

      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Emotion</th>
              <th className="px-4 py-3">Trades</th>
              <th className="px-4 py-3">Win rate</th>
              <th className="px-4 py-3 text-right">Avg P/L</th>
              <th className="px-4 py-3 text-right">Net P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {emotions.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-medium capitalize">{row.name}</td>
                <td className="num px-4 py-3 text-muted-foreground">{row.trades}</td>
                <td className="num px-4 py-3 text-muted-foreground">{pct(row.winRate)}</td>
                <td
                  className={`num px-4 py-3 text-right ${
                    row.avgPnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {money(row.avgPnl)}
                </td>
                <td
                  className={`num px-4 py-3 text-right font-medium ${
                    row.pnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {money(row.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="surface-card mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Timeframe</th>
              <th className="px-4 py-3">Trades</th>
              <th className="px-4 py-3">Win rate</th>
              <th className="px-4 py-3 text-right">Net P/L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {byTimeframe.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="num px-4 py-3 text-muted-foreground">{row.trades}</td>
                <td className="num px-4 py-3 text-muted-foreground">{pct(row.winRate)}</td>
                <td
                  className={`num px-4 py-3 text-right font-medium ${
                    row.pnl >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {money(row.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
