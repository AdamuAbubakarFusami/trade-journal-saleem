import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { MIN_TRADES, drawdownAnalytics } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";
import { money } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/drawdown")({
  head: () => ({
    meta: [
      { title: "Drawdown Analytics — SaleemJournal" },
      {
        name: "description",
        content:
          "Maximum, average and current drawdown, recovery speed and every drawdown episode found in your trading journal.",
      },
      { property: "og:title", content: "Drawdown Analytics — SaleemJournal" },
      {
        property: "og:description",
        content: "Underwater curves and recovery statistics from your own equity history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DrawdownPage,
});

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
};

function DrawdownPage() {
  const { data: trades = [] } = useTrades();
  const dd = useMemo(() => drawdownAnalytics(trades), [trades]);
  const context = useMemo(
    () =>
      packContext({
        page: "Drawdown analytics",
        maxDrawdown: dd.maxDrawdown,
        avgDrawdown: dd.avgDrawdown,
        currentDrawdown: dd.currentDrawdown,
        longestDrawdownTrades: dd.longestDrawdown,
        recoveryTradesAvg: dd.recoveryTradesAvg,
        recoveryFactor: dd.recoveryFactor,
        episodes: dd.episodes,
        monthly: dd.monthly,
      }),
    [dd],
  );

  if (trades.length < MIN_TRADES) {
    return (
      <InstitutionalPage
        title="Drawdown"
        description="Underwater analysis of your equity"
        slug="drawdown"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Drawdown", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="Drawdown"
      description="How deep, how long and how well you recover from losing runs"
      slug="drawdown"
      csvRows={() => [
        ["Trade", "Date", "Equity", "Drawdown", "Drawdown %", "Rolling 20 worst"],
        ...dd.series.map((s) => [s.index, s.date, s.equity, s.drawdown, s.pctDd, s.rolling]),
      ]}
      pdfSections={() => [
        {
          heading: "Drawdown summary",
          items: [
            `Maximum drawdown: ${money(dd.maxDrawdown)}`,
            `Average drawdown: ${money(dd.avgDrawdown)}`,
            `Current drawdown: ${money(dd.currentDrawdown)}`,
            `Longest drawdown: ${dd.longestDrawdown} trades`,
            `Average recovery: ${dd.recoveryTradesAvg ?? "—"} trades`,
            `Recovery factor: ${dd.recoveryFactor ?? "—"}`,
          ],
        },
        {
          heading: "Deepest episodes",
          items: dd.episodes.map(
            (e) =>
              `${e.start} → ${e.end ?? "ongoing"}: ${money(e.depth)} over ${e.trades} trades`,
          ),
        },
      ]}
    >
      <Panel title="Drawdown profile" description="All values come from your realised equity curve.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="Maximum drawdown"
            value={money(dd.maxDrawdown)}
            rating="poor"
            ratingLabel="Worst case"
            formula="min(equity − running peak)"
            plain="The deepest peak-to-trough loss you have lived through."
            interpretation="Position sizing should assume this can repeat, and be survivable when it does."
          />
          <MetricTile
            label="Average drawdown"
            value={money(dd.avgDrawdown)}
            plain="Typical depth of a losing run."
            formula="mean(depth of each drawdown episode)"
            interpretation="Normal operating pain — reaching this depth is not a reason to change a working system."
          />
          <MetricTile
            label="Current drawdown"
            value={money(dd.currentDrawdown)}
            rating={dd.currentDrawdown === 0 ? "excellent" : "average"}
            ratingLabel={dd.currentDrawdown === 0 ? "At equity high" : "Underwater"}
            plain="Distance from your best balance right now."
            interpretation={
              dd.currentDrawdown === 0
                ? "You are at a fresh high — this is where over-confidence and size creep usually start."
                : "Recover with process, not size: increasing risk inside a drawdown is the classic account killer."
            }
          />
          <MetricTile
            label="Longest drawdown"
            value={`${dd.longestDrawdown} trades`}
            plain="Most trades spent below a previous peak."
            formula="max(trades within one drawdown episode)"
            interpretation="This is the psychological endurance your system demands of you."
          />
          <MetricTile
            label="Average recovery"
            value={dd.recoveryTradesAvg === null ? "—" : `${dd.recoveryTradesAvg} trades`}
            plain="How quickly you typically get back to a new high."
            formula="mean(trades per completed drawdown episode)"
            interpretation="Faster recovery means the edge reasserts itself quickly after variance."
          />
          <MetricTile
            label="Recovery factor"
            value={dd.recoveryFactor === null ? "—" : dd.recoveryFactor.toFixed(2)}
            rating={
              dd.recoveryFactor === null
                ? "neutral"
                : dd.recoveryFactor >= 3
                  ? "excellent"
                  : dd.recoveryFactor >= 1
                    ? "good"
                    : "poor"
            }
            ratingLabel={dd.recoveryFactor === null ? "No data" : "Net P/L per unit of pain"}
            formula="net P/L ÷ |maximum drawdown|"
            plain="Profit earned for each unit of worst-case loss."
            interpretation="Above 3 is institutional quality; below 1 means you have not yet out-earned your worst run."
          />
        </div>
      </Panel>

      <Panel title="Underwater curve" description="Every point below zero is capital yet to be recovered.">
        <div className="chart-lg">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dd.series}>
              <defs>
                <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="drawdown"
                stroke="var(--color-destructive)"
                strokeWidth={1.5}
                fill="url(#ddFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Drawdown percentage" description="Depth relative to the running peak.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dd.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  dataKey="pctDd"
                  stroke="var(--color-warning)"
                  fill="var(--color-warning)"
                  fillOpacity={0.18}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Worst drawdown by month" description="Where your equity took the most damage.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dd.monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 0, 3, 3]}>
                  {dd.monthly.map((m) => (
                    <Cell key={m.name} fill="var(--color-destructive)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Drawdown episodes" description="The ten deepest losing runs in your journal.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Started</th>
                <th className="py-2 pr-4">Recovered</th>
                <th className="py-2 pr-4">Depth</th>
                <th className="py-2">Trades</th>
              </tr>
            </thead>
            <tbody>
              {dd.episodes.map((e) => (
                <tr key={`${e.start}-${e.depth}`} className="border-b border-border/50">
                  <td className="py-2 pr-4">{e.start}</td>
                  <td className="py-2 pr-4">{e.end ?? "Ongoing"}</td>
                  <td className="py-2 pr-4 text-destructive">{money(e.depth)}</td>
                  <td className="py-2">{e.trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI drawdown read" />
    </InstitutionalPage>
  );
}
