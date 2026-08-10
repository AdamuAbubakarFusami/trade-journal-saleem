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
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, marketIntelligence } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/market-intelligence")({
  head: () => ({
    meta: [
      { title: "Market Intelligence — SaleemJournal" },
      {
        name: "description",
        content:
          "Forex, crypto, stocks, DEX, futures and options compared on profit, win rate, expectancy, risk, drawdown and psychology.",
      },
      { property: "og:title", content: "Market Intelligence — SaleemJournal" },
      { property: "og:description", content: "Which markets your edge actually works in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketIntelligencePage,
});

function MarketIntelligencePage() {
  const { data: trades = [] } = useTrades();
  const rows = useMemo(() => marketIntelligence(trades), [trades]);
  const context = useMemo(
    () => packContext({ page: "Market intelligence", sampleSize: trades.length, markets: rows }),
    [rows, trades.length],
  );

  if (!rows) {
    return (
      <InstitutionalPage
        title="Market Intelligence"
        description="Which markets carry your edge"
        slug="market-intelligence"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Market intelligence", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="Market Intelligence"
      description={`${rows.length} markets compared across ${trades.length} completed trades`}
      slug="market-intelligence"
      csvRows={() => [
        ["Market", "Trades", "Net P/L", "Win rate", "Expectancy", "Avg risk %", "Max drawdown", "Psychology"],
        ...rows.map((r) => [
          r.name,
          r.trades,
          r.netPnl,
          `${r.winRate}%`,
          r.expectancy,
          r.avgRisk ?? "",
          r.maxDrawdown,
          r.psychology,
        ]),
      ]}
      pdfSections={() => [
        {
          heading: "Market comparison",
          items: rows.map(
            (r) =>
              `${r.name}: ${r.trades} trades, $${r.netPnl} net, ${r.winRate}% win rate, expectancy $${r.expectancy}, max drawdown $${r.maxDrawdown}`,
          ),
        },
      ]}
    >
      <Panel title="Market scorecards" description="Profit, risk and psychology per market you trade.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <MetricTile
              key={r.name}
              label={r.name}
              value={`$${r.netPnl.toLocaleString()}`}
              rating={r.netPnl > 0 ? "good" : "poor"}
              ratingLabel={`${r.trades} trades`}
              plain={`${r.winRate.toFixed(1)}% win rate · avg risk ${r.avgRisk ?? "—"}% · psychology ${r.psychology}/100`}
              interpretation={`Expectancy $${r.expectancy} per trade with a $${r.maxDrawdown} worst drawdown in this market.`}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Profit by market" description="Realised net P/L contributed by each market.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="netPnl" radius={[4, 4, 0, 0]}>
                {rows.map((r) => (
                  <Cell key={r.name} fill={r.netPnl >= 0 ? "var(--color-success)" : "var(--color-destructive)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Detailed table" description="Every market metric side by side.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Market", "Trades", "Net P/L", "Win rate", "Expectancy", "Avg risk", "Max DD", "Psychology"].map(
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
                <tr key={r.name} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.trades}</td>
                  <td className={`px-3 py-2 ${r.netPnl >= 0 ? "text-success" : "text-destructive"}`}>${r.netPnl}</td>
                  <td className="px-3 py-2">{r.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">${r.expectancy}</td>
                  <td className="px-3 py-2">{r.avgRisk ?? "—"}%</td>
                  <td className="px-3 py-2 text-destructive">${r.maxDrawdown}</td>
                  <td className="px-3 py-2">{r.psychology}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <AiInterpretation kind="performance" context={context} title="Saleem AI market read" />
    </InstitutionalPage>
  );
}
