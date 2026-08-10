import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
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
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, performanceMetrics } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/performance-metrics")({
  head: () => ({
    meta: [
      { title: "Institutional Performance Metrics — SaleemJournal" },
      {
        name: "description",
        content:
          "Sharpe, Sortino, Calmar, MAR, Omega, Ulcer, Sterling, SQN, Z score, variance and coefficient of variation from your trading journal.",
      },
      { property: "og:title", content: "Institutional Performance Metrics — SaleemJournal" },
      {
        property: "og:description",
        content: "Fourteen hedge-fund grade performance ratios computed on your own trade record.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PerformanceMetricsPage,
});

function PerformanceMetricsPage() {
  const { data: trades = [] } = useTrades();
  const metrics = useMemo(() => performanceMetrics(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Institutional performance metrics",
        sampleSize: trades.length,
        metrics: metrics?.map((m) => ({ label: m.label, value: m.display, formula: m.formula })),
      }),
    [metrics, trades.length],
  );

  if (!metrics) {
    return (
      <InstitutionalPage
        title="Performance Metrics"
        description="Hedge-fund grade ratios from your journal"
        slug="performance-metrics"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Performance metrics", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const ratioKeys = ["sharpe", "sortino", "calmar", "mar", "omega", "recovery", "sterling", "sqn"];
  const chart = metrics
    .filter((m) => ratioKeys.includes(m.key) && m.value !== null)
    .map((m) => ({ name: m.label.replace(" ratio", ""), value: m.value as number }));
  const radar = chart.map((c) => ({ name: c.name, value: Math.max(0, Math.min(100, c.value * 25)) }));

  return (
    <InstitutionalPage
      title="Institutional Performance Metrics"
      description={`Fourteen risk-adjusted measures computed on ${trades.length} completed trades`}
      slug="performance-metrics"
      csvRows={() => [
        ["Metric", "Value", "Rating", "Formula"],
        ...metrics.map((m) => [m.label, m.display, m.ratingLabel, m.formula]),
      ]}
      pdfSections={() => [
        {
          heading: "Institutional performance metrics",
          items: metrics.map((m) => `${m.label}: ${m.display} (${m.ratingLabel}) — ${m.interpretation}`),
        },
      ]}
    >
      <Panel title="Full metric set" description="Every ratio with its formula, plain-English meaning and reading.">
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Ratio comparison" description="Raw values of the eight core risk-adjusted ratios.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Quality profile" description="The same ratios normalised to a 0–100 quality scale.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <Radar
                  dataKey="value"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.28}
                  isAnimationActive
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <AiInterpretation kind="performance" context={context} title="Saleem AI performance read" />
    </InstitutionalPage>
  );
}
