import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, strategyLab } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/strategy-lab")({
  head: () => ({
    meta: [
      { title: "Strategy Lab — SaleemJournal" },
      {
        name: "description",
        content:
          "Compare every strategy on win rate, profit factor, expectancy, RR, drawdown, consistency, execution and psychology scores.",
      },
      { property: "og:title", content: "Strategy Lab — SaleemJournal" },
      { property: "og:description", content: "Evidence-based ranking of every setup you trade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StrategyLabPage,
});

function StrategyLabPage() {
  const { data: trades = [] } = useTrades();
  const lab = useMemo(() => strategyLab(trades), [trades]);
  const context = useMemo(
    () => packContext({ page: "Strategy lab", sampleSize: trades.length, strategies: lab?.rows }),
    [lab, trades.length],
  );

  if (!lab) {
    return (
      <InstitutionalPage
        title="Strategy Lab"
        description="Compare every strategy you trade"
        slug="strategy-lab"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Strategy lab", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const { rows, best } = lab;
  const head = [
    "Strategy",
    "Trades",
    "Win rate",
    "Profit factor",
    "Expectancy",
    "Avg RR",
    "Max DD",
    "Consistency",
    "Execution",
    "Psychology",
    "Best session",
    "Worst session",
    "Best day",
    "Best month",
  ];

  return (
    <InstitutionalPage
      title="Strategy Lab"
      description={`${rows.length} strategies compared across ${trades.length} completed trades`}
      slug="strategy-lab"
      csvRows={() => [
        head,
        ...rows.map((r) => [
          r.name,
          r.trades,
          `${r.winRate}%`,
          r.profitFactor ?? "",
          r.expectancy,
          r.avgRr ?? "",
          r.maxDrawdown,
          r.consistency,
          r.execution,
          r.psychology,
          r.bestSession,
          r.worstSession,
          r.bestDay,
          r.bestMonth,
        ]),
      ]}
      pdfSections={() => [
        {
          heading: "Strategy ranking",
          items: rows.map(
            (r) =>
              `${r.name}: ${r.trades} trades, ${r.winRate}% win rate, PF ${r.profitFactor ?? "—"}, expectancy $${r.expectancy}, score ${r.score}/100`,
          ),
        },
        {
          heading: "Evidence-based recommendation",
          body: best
            ? `${best.name} is the strongest strategy in the journal: ${best.trades} trades, ${best.winRate}% win rate, profit factor ${best.profitFactor ?? "—"} and $${best.netPnl} net.`
            : "No strategy has enough profitable, repeated evidence to be recommended yet.",
        },
      ]}
    >
      <Panel
        title="Evidence-based recommendation"
        description="Chosen only from realised results — never from a market view."
      >
        {best ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              label="Strongest strategy"
              value={best.name}
              rating="excellent"
              ratingLabel={`Score ${best.score}/100`}
              interpretation={`${best.trades} trades, ${best.winRate}% win rate, ${best.avgRr ?? "—"}R average payoff.`}
            />
            <MetricTile label="Net P/L" value={`$${best.netPnl.toLocaleString()}`} plain="Total realised on this strategy." />
            <MetricTile label="Best session" value={best.bestSession} plain="Where this setup performs best." />
            <MetricTile label="Best month" value={best.bestMonth} plain="Strongest calendar month recorded." />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No strategy yet shows at least three trades and positive net P/L, so no recommendation can be made from
            evidence.
          </p>
        )}
      </Panel>

      <Panel title="Full comparison" description="Every logged strategy across ten dimensions.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {head.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.trades}</td>
                  <td className="px-3 py-2">{r.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{r.profitFactor ?? "—"}</td>
                  <td className={`px-3 py-2 ${r.expectancy >= 0 ? "text-success" : "text-destructive"}`}>
                    ${r.expectancy}
                  </td>
                  <td className="px-3 py-2">{r.avgRr ?? "—"}</td>
                  <td className="px-3 py-2 text-destructive">${r.maxDrawdown}</td>
                  <td className="px-3 py-2">{r.consistency}</td>
                  <td className="px-3 py-2">{r.execution}</td>
                  <td className="px-3 py-2">{r.psychology}</td>
                  <td className="px-3 py-2">{r.bestSession}</td>
                  <td className="px-3 py-2">{r.worstSession}</td>
                  <td className="px-3 py-2">{r.bestDay}</td>
                  <td className="px-3 py-2">{r.bestMonth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Net P/L by strategy" description="Realised profit contributed by each setup.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map((r) => ({ name: r.name, pnl: r.netPnl }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="pnl" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <AiInterpretation kind="strategy" context={context} title="Saleem AI strategy read" />
    </InstitutionalPage>
  );
}
