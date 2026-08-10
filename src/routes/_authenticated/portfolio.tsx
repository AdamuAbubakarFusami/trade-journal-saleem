import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
import { MIN_TRADES, portfolioAnalytics, type Allocation } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio Analytics — SaleemJournal" },
      {
        name: "description",
        content:
          "Asset, sector and market allocation, correlation matrix, diversification score, concentration risk and total exposure from your journal.",
      },
      { property: "og:title", content: "Portfolio Analytics — SaleemJournal" },
      { property: "og:description", content: "How your exposure is distributed and where it concentrates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});

const COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-destructive)",
  "var(--color-accent)",
  "var(--color-muted-foreground)",
];

function AllocationPie({ title, rows }: { title: string; rows: Allocation[] }) {
  return (
    <Panel title={title} description="Share of total exposure, derived from position size and entry price.">
      <div className="chart-md">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="share" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
              }}
              formatter={(v: number) => `${Number(v).toFixed(1)}%`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {rows.slice(0, 8).map((r, i) => (
          <li key={r.name} className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {r.name}
            </span>
            <span className="num">{r.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function PortfolioPage() {
  const { data: trades = [] } = useTrades();
  const data = useMemo(() => portfolioAnalytics(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Portfolio analytics",
        sampleSize: trades.length,
        allocation: data?.byAsset,
        diversification: data?.diversification,
        concentration: data?.concentration,
      }),
    [data, trades.length],
  );

  if (!data) {
    return (
      <InstitutionalPage
        title="Portfolio Analytics"
        description="Allocation, correlation and concentration"
        slug="portfolio"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Portfolio analytics", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const { byAsset, byMarket, bySector, matrix, diversification, concentration, topShare, totalExposure } = data;

  return (
    <InstitutionalPage
      title="Portfolio Analytics"
      description={`Total exposure $${totalExposure.toLocaleString()} across ${byAsset.length} assets`}
      slug="portfolio"
      csvRows={() => [
        ["Asset", "Trades", "Exposure", "Share %", "Net P/L"],
        ...byAsset.map((r) => [r.name, r.trades, r.exposure, r.share, r.pnl]),
      ]}
      pdfSections={() => [
        {
          heading: "Allocation",
          items: byAsset.map((r) => `${r.name}: ${r.share}% of exposure across ${r.trades} trades ($${r.pnl})`),
        },
        {
          heading: "Risk concentration",
          body: `Diversification score ${diversification}/100, concentration risk ${concentration}/100, largest single asset ${topShare}% of exposure.`,
        },
      ]}
    >
      <Panel title="Concentration and diversification" description="Herfindahl-Hirschman based measures of exposure spread.">
        <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-wrap justify-center gap-6">
            <RadialGauge value={diversification} label="Diversification" sublabel="score" />
            <RadialGauge value={Math.max(0, 100 - concentration)} label="Concentration safety" sublabel="score" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricTile
              label="Largest position share"
              value={`${topShare.toFixed(1)}%`}
              rating={topShare > 50 ? "poor" : topShare > 30 ? "average" : "good"}
              ratingLabel={topShare > 50 ? "Concentrated" : topShare > 30 ? "Watch" : "Balanced"}
              plain="Share of total exposure in your single largest asset."
            />
            <MetricTile
              label="Concentration risk"
              value={`${concentration}/100`}
              plain="Herfindahl index of asset exposure, scaled to 100."
              formula="HHI = Σ (shareᵢ)²"
            />
            <MetricTile label="Total exposure" value={`$${totalExposure.toLocaleString()}`} plain="Sum of notional exposure across logged trades." />
            <MetricTile label="Assets traded" value={String(byAsset.length)} plain="Distinct instruments in the journal." />
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-3">
        <AllocationPie title="Asset allocation" rows={byAsset} />
        <AllocationPie title="Market allocation" rows={byMarket} />
        <AllocationPie title="Sector / setup allocation" rows={bySector} />
      </div>

      <Panel title="Correlation matrix" description="Daily P/L correlation between your most-traded assets.">
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1" />
                {matrix.map((row) => (
                  <th key={row.name} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                    {row.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.name}>
                  <td className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">{row.name}</td>
                  {row.cells.map((cell) => (
                    <td key={cell.name} className="p-1">
                      <div
                        className="grid h-9 w-14 place-items-center rounded-md text-[11px] font-medium"
                        style={{
                          background: `color-mix(in oklab, var(${
                            cell.value >= 0 ? "--color-success" : "--color-destructive"
                          }) ${Math.round(Math.abs(cell.value) * 65)}%, transparent)`,
                        }}
                      >
                        {cell.value.toFixed(2)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          High positive correlation between assets means they win and lose together — real diversification requires
          uncorrelated exposure.
        </p>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI portfolio read" />
    </InstitutionalPage>
  );
}
