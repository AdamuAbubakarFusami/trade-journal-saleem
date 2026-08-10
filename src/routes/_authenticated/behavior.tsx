import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  Panel,
  RatingBadge,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, behaviorPatterns, type BehaviorPattern } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/behavior")({
  head: () => ({
    meta: [
      { title: "AI Behavioral Intelligence — SaleemJournal" },
      {
        name: "description",
        content:
          "Revenge trading, FOMO, loss aversion, recency bias and eleven other behavioural patterns detected in your own trade history with evidence.",
      },
      { property: "og:title", content: "AI Behavioral Intelligence — SaleemJournal" },
      {
        property: "og:description",
        content: "Fourteen trading biases detected from journal evidence, each with the trades that prove it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BehaviorPage,
});

function PatternCard({ pattern }: { pattern: BehaviorPattern }) {
  return (
    <article className="ai-surface flex h-full flex-col rounded-xl border border-border/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {pattern.detected ? (
            <AlertTriangle className="h-4 w-4 text-warning" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-success" />
          )}
          {pattern.label}
        </h3>
        <RatingBadge
          rating={pattern.severity}
          label={pattern.detected ? `${pattern.count} found` : "Clear"}
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground/80">Why: </span>
        {pattern.why}
      </p>
      <p className="mt-3 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">{pattern.impact}</p>
      {pattern.evidence.length ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Historical evidence
          </p>
          <ul className="space-y-1">
            {pattern.evidence.map((e) => (
              <li key={e} className="font-mono text-[11px] text-foreground/80">
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function BehaviorPage() {
  const { data: trades = [] } = useTrades();
  const patterns = useMemo(() => behaviorPatterns(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Behavioral intelligence",
        sampleSize: trades.length,
        patterns: patterns?.map((p) => ({ label: p.label, count: p.count, impact: p.impact })),
      }),
    [patterns, trades.length],
  );

  if (!patterns) {
    return (
      <InstitutionalPage
        title="Behavioral Intelligence"
        description="Bias detection from journal evidence"
        slug="behavior"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Behavioral intelligence", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const detected = patterns.filter((p) => p.detected);
  const chart = patterns
    .filter((p) => p.count > 0)
    .map((p) => ({ name: p.label, value: p.count, severity: p.severity }))
    .sort((a, b) => b.value - a.value);

  return (
    <InstitutionalPage
      title="AI Behavioral Intelligence"
      description={`${detected.length} of 14 behavioural patterns detected across ${trades.length} trades`}
      slug="behavior"
      csvRows={() => [
        ["Pattern", "Detected", "Occurrences", "Impact", "Why"],
        ...patterns.map((p) => [p.label, p.detected ? "Yes" : "No", p.count, p.impact, p.why]),
      ]}
      pdfSections={() => [
        {
          heading: "Detected behavioural patterns",
          items: detected.map((p) => `${p.label} (${p.count}) — ${p.impact}. ${p.why}`),
        },
        {
          heading: "Clear of these patterns",
          items: patterns.filter((p) => !p.detected).map((p) => p.label),
        },
      ]}
    >
      <Panel
        title="Occurrence frequency"
        description="How often each behaviour appears in the trades you have logged."
      >
        {chart.length ? (
          <div className="chart-lg">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={170}
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
                        c.severity === "poor"
                          ? "var(--color-destructive)"
                          : c.severity === "average"
                            ? "var(--color-warning)"
                            : "var(--color-primary)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No behavioural pattern triggered on the trades logged so far.
          </p>
        )}
      </Panel>

      <Panel title="Every pattern, with evidence" description="Detection rules run on your journal — no model guesses.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patterns.map((p) => (
            <PatternCard key={p.key} pattern={p} />
          ))}
        </div>
      </Panel>

      <AiInterpretation kind="emotion" context={context} title="Saleem AI behavioural read" />
    </InstitutionalPage>
  );
}
