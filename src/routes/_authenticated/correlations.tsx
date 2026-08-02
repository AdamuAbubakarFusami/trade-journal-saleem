import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, correlationMatrix, groupPerformance, pnlCorrelations } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";
import { money } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/correlations")({
  head: () => ({
    meta: [
      { title: "Correlation Engine — SaleemJournal" },
      {
        name: "description",
        content:
          "Correlation matrices linking risk, confidence, emotions and hold time to your profit and loss, plus performance by every grouping.",
      },
      { property: "og:title", content: "Correlation Engine — SaleemJournal" },
      {
        property: "og:description",
        content: "Discover which journal variables actually move your results.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CorrelationsPage,
});

function heatClass(v: number | null) {
  if (v === null) return "bg-muted/30 text-muted-foreground";
  const a = Math.abs(v);
  if (v >= 0)
    return a > 0.6
      ? "bg-success/40 text-success-foreground"
      : a > 0.3
        ? "bg-success/25 text-foreground"
        : "bg-success/10 text-foreground";
  return a > 0.6
    ? "bg-destructive/40 text-destructive-foreground"
    : a > 0.3
      ? "bg-destructive/25 text-foreground"
      : "bg-destructive/10 text-foreground";
}

function CorrelationsPage() {
  const { data: trades = [] } = useTrades();
  const matrix = useMemo(() => correlationMatrix(trades), [trades]);
  const drivers = useMemo(() => pnlCorrelations(trades), [trades]);
  const groups = useMemo(() => groupPerformance(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Correlation engine",
        pnlCorrelations: drivers,
        groups: groups.map((g) => ({ label: g.label, rows: g.rows.slice(0, 10) })),
      }),
    [drivers, groups],
  );

  if (trades.length < MIN_TRADES) {
    return (
      <InstitutionalPage
        title="Correlations"
        description="What actually drives your results"
        slug="correlations"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Correlations", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="Correlations"
      description="Pearson correlations between your journal variables and your profit and loss"
      slug="correlations"
      csvRows={() => [
        ["Variable", "Correlation with P/L", "Sample"],
        ...drivers.map((d) => [d.label, d.value, d.n]),
        [],
        ["Grouping", "Name", "Trades", "Net P/L", "Win rate %"],
        ...groups.flatMap((g) =>
          g.rows.map((r) => [g.label, r.name, r.trades, r.pnl, r.winRate.toFixed(1)]),
        ),
      ]}
      pdfSections={() => [
        {
          heading: "Strongest links to P/L",
          items: drivers.map(
            (d) => `${d.label}: r = ${d.value} across ${d.n} trades`,
          ),
        },
        ...groups.slice(0, 8).map((g) => ({
          heading: `${g.label} performance`,
          items: g.rows
            .slice(0, 10)
            .map((r) => `${r.name}: ${r.trades} trades, ${money(r.pnl)}, ${r.winRate.toFixed(1)}% win rate`),
        })),
      ]}
    >
      <Panel
        title="What correlates with your P/L"
        description="Correlation is not causation — treat these as hypotheses to test with more trades."
      >
        <div className="space-y-2">
          {drivers.map((d) => (
            <div key={d.label} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-sm text-muted-foreground">{d.label}</span>
              <div className="relative h-3 flex-1 rounded-full bg-muted/40">
                <div
                  className={cn(
                    "absolute top-0 h-3 rounded-full",
                    (d.value ?? 0) >= 0 ? "bg-success" : "bg-destructive",
                  )}
                  style={{
                    width: `${Math.abs(d.value ?? 0) * 50}%`,
                    left: (d.value ?? 0) >= 0 ? "50%" : undefined,
                    right: (d.value ?? 0) < 0 ? "50%" : undefined,
                  }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-sm font-medium">
                {d.value} <span className="text-xs text-muted-foreground">n={d.n}</span>
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Correlation matrix" description="Pearson r between every numeric field you journal.">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th />
                {matrix.fields.map((f) => (
                  <th key={f} className="px-1 pb-1 text-left font-medium text-muted-foreground">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.label}>
                  <td className="whitespace-nowrap pr-2 text-muted-foreground">{row.label}</td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.label}
                      className={cn("rounded-md px-2 py-1.5 text-center", heatClass(cell.value))}
                      title={`${row.label} vs ${cell.label} · n=${cell.n}`}
                    >
                      {cell.value === null ? "—" : cell.value.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.label} title={`${g.label} performance`} description="Top groups by net P/L.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">{g.label}</th>
                    <th className="py-2 pr-4">Trades</th>
                    <th className="py-2 pr-4">Net P/L</th>
                    <th className="py-2">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.slice(0, 8).map((r) => (
                    <tr key={r.name} className="border-b border-border/50">
                      <td className="py-2 pr-4">{r.name}</td>
                      <td className="py-2 pr-4">{r.trades}</td>
                      <td
                        className={cn(
                          "py-2 pr-4",
                          r.pnl >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {money(r.pnl)}
                      </td>
                      <td className="py-2">{r.winRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))}
      </div>

      <AiInterpretation kind="consistency" context={context} title="Saleem AI correlation read" />
    </InstitutionalPage>
  );
}
