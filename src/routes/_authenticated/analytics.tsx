import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrades } from "@/hooks/use-trades";
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

function Analytics() {
  const { data: trades, isLoading } = useTrades();
  const stats = useMemo(() => computeStats(trades ?? []), [trades]);

  const byStrategy = useMemo(() => groupBy(trades ?? [], (t) => t.strategy), [trades]);
  const bySession = useMemo(() => groupBy(trades ?? [], (t) => t.session), [trades]);
  const byMarket = useMemo(() => groupBy(trades ?? [], (t) => t.market), [trades]);
  const byTimeframe = useMemo(() => groupBy(trades ?? [], (t) => t.timeframe), [trades]);

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
        <div className="surface-card p-14 text-center text-sm text-muted-foreground">
          Log a few trades and your analytics will populate here.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics" description="Where your edge really comes from">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Profit factor", value: Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞" },
          { label: "Average win", value: money(stats.avgWin) },
          { label: "Average loss", value: money(stats.avgLoss) },
          { label: "Expectancy", value: money(stats.total ? stats.netPnl / stats.total : 0) },
        ].map((s) => (
          <div key={s.label} className="surface-card p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="num mt-2 text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="P/L by strategy">
          <PnlBars data={byStrategy} />
        </Panel>
        <Panel title="P/L by session">
          <PnlBars data={bySession} />
        </Panel>
        <Panel title="P/L by market">
          <PnlBars data={byMarket} />
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
