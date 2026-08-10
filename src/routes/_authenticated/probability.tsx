import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { RadialGauge } from "@/components/ai-ui";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, monteCarlo, probabilityAnalytics } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";

export const Route = createFileRoute("/_authenticated/probability")({
  head: () => ({
    meta: [
      { title: "Probability Analytics — SaleemJournal" },
      {
        name: "description",
        content:
          "Probability of ruin, capital survival, recovery odds and expected returns computed from your journal's own statistics.",
      },
      { property: "og:title", content: "Probability Analytics — SaleemJournal" },
      {
        property: "og:description",
        content: "Risk-of-ruin and survival probabilities based on your realised edge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProbabilityPage,
});

function ProbabilityPage() {
  const { data: trades = [] } = useTrades();
  const mc = useMemo(() => monteCarlo(trades, 5000), [trades]);
  const stats = useMemo(() => probabilityAnalytics(trades, mc), [trades, mc]);
  const context = useMemo(
    () =>
      packContext({
        page: "Probability analytics",
        sampleSize: trades.length,
        probabilities: stats?.map((s) => ({ label: s.label, value: s.display, detail: s.detail })),
      }),
    [stats, trades.length],
  );

  if (!stats || !mc) {
    return (
      <InstitutionalPage
        title="Probability"
        description="Survival and ruin mathematics from your own edge"
        slug="probability"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Probability", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const ruin = Number(stats[0].display.replace("%", ""));
  const survival = Math.max(0, 100 - ruin);
  const chart = stats
    .filter((s) => s.display.endsWith("%"))
    .map((s) => ({ name: s.label, value: Number(s.display.replace("%", "")), tone: s.tone }));

  return (
    <InstitutionalPage
      title="Probability"
      description="Risk of ruin, survival odds and expected returns derived from your realised statistics"
      slug="probability"
      csvRows={() => [
        ["Metric", "Value", "Detail"],
        ...stats.map((s) => [s.label, s.display, s.detail]),
      ]}
      pdfSections={() => [
        {
          heading: "Probability analytics",
          items: stats.map((s) => `${s.label}: ${s.display} — ${s.detail}`),
        },
      ]}
    >
      <Panel
        title="Capital survival"
        description="Derived from your win rate, payoff ratio and average risk per trade."
      >
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex justify-center gap-6">
            <RadialGauge value={survival} label="Survival" sublabel="probability" />
            <RadialGauge value={mc.probProfit} label="Profitable" sublabel="of simulations" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.slice(0, 4).map((s) => (
              <MetricTile
                key={s.key}
                label={s.label}
                value={s.display}
                rating={s.tone}
                ratingLabel={s.tone === "neutral" ? "Reference" : s.tone}
                interpretation={s.detail}
              />
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Full probability set" description="Every probability is a resampling of your own outcomes — never a market forecast.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.slice(4).map((s) => (
            <MetricTile
              key={s.key}
              label={s.label}
              value={s.display}
              rating={s.tone}
              ratingLabel={s.tone === "neutral" ? "Reference" : s.tone}
              interpretation={s.detail}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Probability comparison" description="All percentage-based probabilities side by side.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
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
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chart.map((c) => (
                  <Cell
                    key={c.name}
                    fill={
                      c.tone === "poor"
                        ? "var(--color-destructive)"
                        : c.tone === "average"
                          ? "var(--color-warning)"
                          : "var(--color-primary)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI survival read" />
    </InstitutionalPage>
  );
}
