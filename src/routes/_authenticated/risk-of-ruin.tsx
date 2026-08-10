import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RadialGauge } from "@/components/ai-ui";
import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, ruinAnalytics } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/risk-of-ruin")({
  head: () => ({
    meta: [
      { title: "Risk of Ruin — SaleemJournal" },
      {
        name: "description",
        content:
          "Risk of ruin, bankruptcy probability, capital survival rate, required win rate and sustainable losing streaks computed from your own journal.",
      },
      { property: "og:title", content: "Risk of Ruin — SaleemJournal" },
      {
        property: "og:description",
        content: "Survival mathematics derived from your realised edge and position sizing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskOfRuinPage,
});

const axis = { stroke: "var(--color-muted-foreground)", fontSize: 11 };
const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
};

function RiskOfRuinPage() {
  const { data: trades = [] } = useTrades();
  const data = useMemo(() => ruinAnalytics(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Risk of ruin",
        sampleSize: trades.length,
        metrics: data?.metrics.map((m) => ({ label: m.label, value: m.display })),
        edge: data?.edge,
      }),
    [data, trades.length],
  );

  if (!data) {
    return (
      <InstitutionalPage
        title="Risk of Ruin"
        description="Survival mathematics from your own edge"
        slug="risk-of-ruin"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Risk of ruin", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const { edge, metrics, riskOfRuin, survivalRate, survivalCurve, decayCurve } = data;

  return (
    <InstitutionalPage
      title="Risk of Ruin"
      description={`Resampled from ${edge.sample} completed trades at ${(edge.riskFraction * 100).toFixed(2)}% average risk per trade`}
      slug="risk-of-ruin"
      csvRows={() => [
        ["Metric", "Value", "Formula"],
        ...metrics.map((m) => [m.label, m.display, m.formula]),
      ]}
      pdfSections={() => [
        {
          heading: "Risk of ruin",
          items: metrics.map((m) => `${m.label}: ${m.display} — ${m.interpretation}`),
        },
        {
          heading: "Edge profile",
          items: [
            `Estimated capital: $${edge.capital.toLocaleString()}`,
            `Win rate: ${edge.winRate.toFixed(1)}%`,
            `Payoff ratio: ${edge.payoff.toFixed(2)}R`,
            `Expectancy: ${edge.expectancyR.toFixed(2)}R per trade`,
          ],
        },
      ]}
    >
      <Panel
        title="Risk gauge"
        description="Ruin means capital falls to 20% of where it started, at your current risk per trade."
      >
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-wrap justify-center gap-6">
            <RadialGauge value={survivalRate} label="Capital survival" sublabel="of paths" />
            <RadialGauge value={Math.max(0, 100 - riskOfRuin)} label="Not ruined" sublabel="200 trades" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {metrics.slice(0, 4).map((m) => (
              <MetricTile
                key={m.key}
                label={m.label}
                value={m.display}
                rating={m.rating}
                ratingLabel={m.ratingLabel}
                formula={m.formula}
                plain={m.plain}
                interpretation={m.interpretation}
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Every ruin metric explained" description="Each figure is derived, never estimated by a model.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map((m) => (
            <MetricTile
              key={m.key}
              label={m.label}
              value={m.display}
              rating={m.rating}
              ratingLabel={m.ratingLabel}
              formula={m.formula}
              plain={m.plain}
              interpretation={m.interpretation}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Survival curve"
        description="Share of resampled futures still tradeable after N trades."
      >
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={survivalCurve}>
              <defs>
                <linearGradient id="survivalFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="trade" {...axis} />
              <YAxis domain={[0, 100]} unit="%" {...axis} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
              <Area
                type="monotone"
                dataKey="survival"
                stroke="var(--color-primary)"
                fill="url(#survivalFill)"
                strokeWidth={2}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Capital decay chart"
        description="Median, 5th and 95th percentile capital paths from resampling your own trades."
      >
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={decayCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="trade" {...axis} />
              <YAxis {...axis} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => `$${Number(v).toLocaleString()}`}
              />
              <Line type="monotone" dataKey="best" stroke="var(--color-success)" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="median" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="worst"
                stroke="var(--color-destructive)"
                dot={false}
                strokeWidth={1.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These paths reshuffle your own completed trades. They describe your sizing, not future market prices.
        </p>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI survival read" />
    </InstitutionalPage>
  );
}
