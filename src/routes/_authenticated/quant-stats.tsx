import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, quantStatistics } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";
import { quantMetrics } from "@/lib/quant";

export const Route = createFileRoute("/_authenticated/quant-stats")({
  head: () => ({
    meta: [
      { title: "Quant Statistics — SaleemJournal" },
      {
        name: "description",
        content:
          "Institutional-grade quantitative statistics from your own trading journal: Sharpe, Sortino, Calmar, Omega, Kelly and SQN with AI interpretation.",
      },
      { property: "og:title", content: "Quant Statistics — SaleemJournal" },
      {
        property: "og:description",
        content: "25+ institutional quant metrics computed from your completed trades.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuantStatsPage,
});

function QuantStatsPage() {
  const { data: trades = [], isLoading } = useTrades();
  const metrics = useMemo(() => quantStatistics(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Quantitative statistics",
        quant: quantMetrics(trades),
        metrics: metrics.map((m) => ({ label: m.label, value: m.value, rating: m.ratingLabel })),
      }),
    [trades, metrics],
  );
  const enough = trades.length >= MIN_TRADES;

  return (
    <InstitutionalPage
      title="Quant Statistics"
      description="Institutional performance metrics computed from your completed trades"
      slug="quant-statistics"
      csvRows={() => [
        ["Metric", "Value", "Rating", "Formula", "Interpretation"],
        ...metrics.map((m) => [m.label, m.display, m.ratingLabel, m.formula, m.interpretation]),
      ]}
      pdfSections={() => [
        {
          heading: "Quantitative statistics",
          items: metrics.map((m) => `${m.label}: ${m.display} (${m.ratingLabel}) — ${m.interpretation}`),
        },
      ]}
    >
      {isLoading ? (
        <Panel title="Loading statistics">
          <p className="text-sm text-muted-foreground">Reading your journal…</p>
        </Panel>
      ) : !enough ? (
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      ) : (
        <>
          <Panel
            title="Core performance ratios"
            description="Every value is derived only from your logged trades — no market forecasting involved."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {metrics.slice(0, 10).map((m) => (
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

          <Panel title="Trade statistics" description="Distribution of outcomes, streaks and sizing.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {metrics.slice(10).map((m) => (
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

          <AiInterpretation kind="performance" context={context} disabled={!enough} />
        </>
      )}
    </InstitutionalPage>
  );
}
