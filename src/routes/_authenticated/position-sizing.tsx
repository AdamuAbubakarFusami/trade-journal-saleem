import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, positionSizing } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/position-sizing")({
  head: () => ({
    meta: [
      { title: "Position Sizing Engine — SaleemJournal" },
      {
        name: "description",
        content:
          "Fixed risk, fixed dollar, Kelly, half Kelly, optimal f, ATR and volatility position sizing compared against the size you actually trade.",
      },
      { property: "og:title", content: "Position Sizing Engine — SaleemJournal" },
      {
        property: "og:description",
        content: "Seven sizing models solved on your own realised trade distribution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PositionSizingPage,
});

function PositionSizingPage() {
  const { data: trades = [] } = useTrades();
  const data = useMemo(() => positionSizing(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Position sizing engine",
        sampleSize: trades.length,
        actualRiskPercent: data?.actualRiskPercent,
        models: data?.models.map((m) => ({ label: m.label, risk: m.riskPercent, formula: m.formula })),
      }),
    [data, trades.length],
  );

  if (!data) {
    return (
      <InstitutionalPage
        title="Position Sizing"
        description="Seven sizing models solved on your own data"
        slug="position-sizing"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Position sizing", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const { edge, models, actualRiskPercent, actualRiskMoney, comparison } = data;

  return (
    <InstitutionalPage
      title="Position Sizing Engine"
      description={`Estimated capital $${edge.capital.toLocaleString()} · you currently risk ${actualRiskPercent.toFixed(2)}% (${actualRiskMoney.toLocaleString(undefined, { style: "currency", currency: "USD" })}) per trade`}
      slug="position-sizing"
      csvRows={() => [
        ["Model", "Formula", "Recommended risk %", "Recommended risk $", "Actual risk %"],
        ...models.map((m) => [m.label, m.formula, m.riskPercent ?? "", m.riskMoney ?? "", actualRiskPercent]),
      ]}
      pdfSections={() => [
        {
          heading: "Position sizing models",
          items: models.map((m) => `${m.label} — ${m.display} · ${m.formula} · ${m.interpretation}`),
        },
        {
          heading: "Actual sizing",
          body: `Your journal averages ${actualRiskPercent.toFixed(2)}% of estimated capital per trade.`,
        },
      ]}
    >
      <Panel
        title="Your realised edge"
        description="Every sizing model below is solved with these inputs — no assumptions added."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Win rate" value={`${edge.winRate.toFixed(1)}%`} plain="Share of completed trades in profit." />
          <MetricTile label="Payoff ratio" value={`${edge.payoff.toFixed(2)}R`} plain="Average win divided by average loss." />
          <MetricTile
            label="Expectancy"
            value={`${edge.expectancyR.toFixed(2)}R`}
            plain="Average R produced by an average trade."
            rating={edge.expectancyR > 0 ? "good" : "poor"}
            ratingLabel={edge.expectancyR > 0 ? "Positive" : "Negative"}
          />
          <MetricTile
            label="Actual risk / trade"
            value={`${actualRiskPercent.toFixed(2)}%`}
            plain="Average risk you have actually been taking."
          />
        </div>
      </Panel>

      <Panel title="Sizing models" description="Each model shows its formula and what it recommends for your account.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {models.map((m) => (
            <MetricTile
              key={m.key}
              label={m.label}
              value={m.display}
              formula={m.formula}
              plain={m.plain}
              interpretation={m.interpretation}
              rating={
                m.riskPercent === null
                  ? "neutral"
                  : m.riskPercent > actualRiskPercent * 1.25
                    ? "good"
                    : m.riskPercent < actualRiskPercent * 0.75
                      ? "average"
                      : "excellent"
              }
              ratingLabel={
                m.riskPercent === null
                  ? "No data"
                  : m.riskPercent > actualRiskPercent * 1.25
                    ? "Above your size"
                    : m.riskPercent < actualRiskPercent * 0.75
                      ? "Below your size"
                      : "Matches your size"
              }
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Recommended vs actual size"
        description="Recommended risk per trade from each model against what your journal shows you actually risk."
      >
        <div className="chart-lg">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparison} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={10}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={60}
              />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} unit="%" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
                formatter={(v: number) => `${Number(v).toFixed(2)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="recommended" name="Recommended" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Your actual" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Kelly and optimal f are growth-optimal but extremely volatile; most professional desks trade a half or a
          quarter of them.
        </p>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI sizing read" />
    </InstitutionalPage>
  );
}
