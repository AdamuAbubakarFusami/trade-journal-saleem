import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { RadialGauge } from "@/components/ai-ui";
import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  Panel,
  RatingBadge,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, benchmark } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/benchmark")({
  head: () => ({
    meta: [
      { title: "AI Benchmark — SaleemJournal" },
      {
        name: "description",
        content:
          "Benchmark your execution, risk, psychology, consistency and profitability against beginner, intermediate, professional and institutional reference bands.",
      },
      { property: "og:title", content: "AI Benchmark — SaleemJournal" },
      { property: "og:description", content: "Where your process sits against professional standards." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BenchmarkPage,
});

function BenchmarkPage() {
  const { data: trades = [] } = useTrades();
  const rows = useMemo(() => benchmark(trades), [trades]);
  const context = useMemo(
    () => packContext({ page: "AI benchmark", sampleSize: trades.length, benchmark: rows }),
    [rows, trades.length],
  );

  if (!rows) {
    return (
      <InstitutionalPage
        title="AI Benchmark"
        description="Your process against professional standards"
        slug="benchmark"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "AI benchmark", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="AI Benchmark"
      description="Scored against published beginner, intermediate, professional and institutional bands"
      slug="benchmark"
      csvRows={() => [
        ["Dimension", "Score", "Tier", "Percentile", "Explanation"],
        ...rows.map((r) => [r.label, r.display, r.tier, `Top ${r.percentile}%`, r.explanation]),
      ]}
      pdfSections={() => [
        {
          heading: "Benchmark results",
          items: rows.map((r) => `${r.label}: ${r.display} — ${r.tier} tier, top ${r.percentile}%. ${r.explanation}`),
        },
      ]}
    >
      <Panel title="Percentile standing" description="Each score is computed from your journal, then placed on the reference bands.">
        <div className="grid gap-6 md:grid-cols-3 xl:grid-cols-5">
          {rows.map((r) => (
            <div key={r.key} className="flex flex-col items-center gap-2">
              <RadialGauge value={r.value} label={r.label} sublabel="/ 100" size={130} />
              <RatingBadge
                rating={
                  r.tier === "Institutional"
                    ? "excellent"
                    : r.tier === "Professional"
                      ? "good"
                      : r.tier === "Intermediate"
                        ? "average"
                        : "poor"
                }
                label={`Top ${r.percentile}%`}
              />
              <p className="text-center text-[11px] text-muted-foreground">{r.tier} tier</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Tier breakdown" description="The band thresholds each dimension is measured against.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Dimension", "Your score", "Tier", "Percentile", "Beginner", "Intermediate", "Professional", "Institutional"].map(
                  (h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2">{r.display}</td>
                  <td className="px-3 py-2">{r.tier}</td>
                  <td className="px-3 py-2">Top {r.percentile}%</td>
                  <td className="px-3 py-2">{r.bands.beginner}</td>
                  <td className="px-3 py-2">{r.bands.intermediate}</td>
                  <td className="px-3 py-2">{r.bands.professional}</td>
                  <td className="px-3 py-2">{r.bands.institutional}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 space-y-2">
          {rows.map((r) => (
            <p key={r.key} className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{r.label}: </span>
              {r.explanation}
            </p>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Reference bands are fixed professional standards, not other users' data — your score itself comes only from
          your own journal.
        </p>
      </Panel>

      <AiInterpretation kind="consistency" context={context} title="Saleem AI benchmark read" />
    </InstitutionalPage>
  );
}
