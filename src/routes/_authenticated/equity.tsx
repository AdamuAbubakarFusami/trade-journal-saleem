import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, equitySeries } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";
import { computeStats, money } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/equity")({
  head: () => ({
    meta: [
      { title: "Equity Analytics — SaleemJournal" },
      {
        name: "description",
        content:
          "Balance, growth, rolling performance and period equity curves built from every trade you have journaled.",
      },
      { property: "og:title", content: "Equity Analytics — SaleemJournal" },
      {
        property: "og:description",
        content: "Institutional equity curves with monthly and yearly growth breakdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EquityPage,
});

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
};

function EquityPage() {
  const { data: trades = [] } = useTrades();
  const series = useMemo(() => equitySeries(trades), [trades]);
  const stats = useMemo(() => computeStats(trades), [trades]);
  const last = series.points[series.points.length - 1];

  const context = useMemo(
    () =>
      packContext({
        page: "Equity analytics",
        startCapital: series.start,
        currentBalance: last?.balance ?? series.start,
        growthPercent: last?.growth ?? 0,
        monthly: series.monthly,
        yearly: series.yearly,
      }),
    [series, last],
  );

  if (trades.length < MIN_TRADES) {
    return (
      <InstitutionalPage
        title="Equity"
        description="Your capital curve, trade by trade"
        slug="equity"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Equity", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="Equity"
      description="Balance progression, growth and rolling performance across your journal"
      slug="equity"
      csvRows={() => [
        ["Trade", "Date", "P/L", "Balance", "Smoothed", "Peak", "Rolling 10", "Growth %"],
        ...series.points.map((p) => [
          p.index,
          p.date,
          p.pnl,
          p.balance,
          p.smooth,
          p.peak,
          p.rolling,
          p.growth,
        ]),
      ]}
      pdfSections={() => [
        {
          heading: "Equity summary",
          items: [
            `Estimated starting capital: ${money(series.start)}`,
            `Current balance: ${money(last?.balance ?? series.start)}`,
            `Total growth: ${last?.growth ?? 0}%`,
            `Net P/L: ${money(stats.netPnl)} across ${trades.length} trades`,
          ],
        },
        {
          heading: "Monthly equity",
          items: series.monthly.map((m) => `${m.name}: ${money(m.pnl)} → balance ${money(m.equity)}`),
        },
        {
          heading: "Yearly equity",
          items: series.yearly.map((y) => `${y.name}: ${money(y.pnl)} → balance ${money(y.equity)}`),
        },
      ]}
    >
      <Panel title="Capital overview" description="Starting capital is inferred from your logged risk % and average loss.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Estimated start"
            value={money(series.start)}
            plain="Inferred account size."
            interpretation="Derived from your average risk percentage and average loss size."
          />
          <MetricTile
            label="Current balance"
            value={money(last?.balance ?? series.start)}
            rating={stats.netPnl >= 0 ? "good" : "poor"}
            ratingLabel={stats.netPnl >= 0 ? "In profit" : "In loss"}
            plain="Cumulative journal equity."
            interpretation={`Net P/L of ${money(stats.netPnl)} across ${trades.length} trades.`}
          />
          <MetricTile
            label="Total growth"
            value={`${last?.growth ?? 0}%`}
            rating={(last?.growth ?? 0) >= 0 ? "good" : "poor"}
            ratingLabel={(last?.growth ?? 0) >= 0 ? "Compounding" : "Eroding"}
            plain="Change against the estimated starting capital."
            interpretation="Growth is measured on closed, journaled trades only."
          />
          <MetricTile
            label="Distance from peak"
            value={money(last?.floating ?? 0)}
            rating={(last?.floating ?? 0) === 0 ? "excellent" : "average"}
            ratingLabel={(last?.floating ?? 0) === 0 ? "At high" : "Below high"}
            plain="Gap between current balance and best balance."
            interpretation="Zero means you are trading at a fresh equity high right now."
          />
        </div>
      </Panel>

      <Panel title="Equity curve" description="Raw balance versus its 10-trade smoothed trend and running peak.">
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series.points}>
              <defs>
                <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="balance"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#eqFill)"
              />
              <Line dataKey="smooth" stroke="var(--color-chart-3)" dot={false} strokeWidth={1.5} />
              <Line
                dataKey="peak"
                stroke="var(--color-muted-foreground)"
                dot={false}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Rolling 10-trade P/L" description="Momentum of your recent process.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="rolling" radius={[3, 3, 0, 0]}>
                  {series.points.map((p) => (
                    <Cell
                      key={p.index}
                      fill={p.rolling >= 0 ? "var(--color-success)" : "var(--color-destructive)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Growth percentage" description="Cumulative growth against estimated capital.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.points}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  dataKey="growth"
                  stroke="var(--color-chart-5)"
                  fill="var(--color-chart-5)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Monthly equity" description="Period P/L and the running balance it produced.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {series.monthly.map((m) => (
                    <Cell
                      key={m.name}
                      fill={m.pnl >= 0 ? "var(--color-success)" : "var(--color-destructive)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Yearly equity" description="Long-term compounding view.">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series.yearly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="equity" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <AiInterpretation kind="performance" context={context} title="Saleem AI equity read" />
    </InstitutionalPage>
  );
}
