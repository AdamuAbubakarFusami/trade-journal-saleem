import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, distributions } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";

export const Route = createFileRoute("/_authenticated/distribution")({
  head: () => ({
    meta: [
      { title: "Trade Distribution — SaleemJournal" },
      {
        name: "description",
        content:
          "Distribution of profits, losses, RR, holding time, risk, sessions, strategies and emotions across your journaled trades.",
      },
      { property: "og:title", content: "Trade Distribution — SaleemJournal" },
      {
        property: "og:description",
        content: "See where your trades cluster and where your results actually come from.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DistributionPage,
});

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
};

function CountChart({ data, color }: { data: { label: string; count: number }[]; color: string }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PnlChart({ data }: { data: { name: string; pnl: number }[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
          <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={d.pnl >= 0 ? "var(--color-success)" : "var(--color-destructive)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DistributionPage() {
  const { data: trades = [] } = useTrades();
  const d = useMemo(() => distributions(trades), [trades]);
  const context = useMemo(
    () => packContext({ page: "Trade distribution", distributions: d, sampleSize: trades.length }),
    [d, trades.length],
  );

  if (trades.length < MIN_TRADES) {
    return (
      <InstitutionalPage
        title="Trade Distribution"
        description="Where your trades and results cluster"
        slug="distribution"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Distribution", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const buckets: [string, { label: string; count: number }[]][] = [
    ["Profit sizes", d.profit],
    ["Loss sizes", d.loss],
    ["Reward-to-risk", d.rr],
    ["Holding time", d.holding],
    ["Position size", d.size],
    ["Risk per trade", d.risk],
  ];
  const groups: [string, { name: string; pnl: number; trades: number; winRate: number }[]][] = [
    ["Session", d.session],
    ["Strategy", d.strategy],
    ["Market", d.market],
    ["Asset", d.asset],
    ["Timeframe", d.timeframe],
    ["Emotion", d.emotion],
    ["Day of week", d.dayOfWeek],
    ["Hour opened (UTC)", d.hour],
  ];

  return (
    <InstitutionalPage
      title="Trade Distribution"
      description="Histograms and group breakdowns across every dimension you journal"
      slug="trade-distribution"
      csvRows={() => [
        ["Distribution", "Bucket", "Count"],
        ...buckets.flatMap(([name, rows]) => rows.map((r) => [name, r.label, r.count])),
        [],
        ["Group", "Name", "Trades", "Net P/L", "Win rate %"],
        ...groups.flatMap(([name, rows]) =>
          rows.map((r) => [name, r.name, r.trades, r.pnl, r.winRate.toFixed(1)]),
        ),
      ]}
      pdfSections={() => [
        ...buckets.map(([name, rows]) => ({
          heading: name,
          items: rows.map((r) => `${r.label}: ${r.count} trades`),
        })),
        ...groups.map(([name, rows]) => ({
          heading: `${name} performance`,
          items: rows.map(
            (r) => `${r.name}: ${r.trades} trades, ${r.pnl} net, ${r.winRate.toFixed(1)}% win rate`,
          ),
        })),
      ]}
    >
      <div className="grid gap-6 xl:grid-cols-2">
        {buckets.map(([name, rows], i) => (
          <Panel key={name} title={name} description="Number of trades per bucket.">
            <CountChart data={rows} color={`var(--color-chart-${(i % 5) + 1})`} />
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map(([name, rows]) => (
          <Panel key={name} title={`${name} P/L`} description="Net result per group.">
            <PnlChart data={rows} />
          </Panel>
        ))}
      </div>

      <AiInterpretation kind="habit" context={context} title="Saleem AI distribution read" />
    </InstitutionalPage>
  );
}
