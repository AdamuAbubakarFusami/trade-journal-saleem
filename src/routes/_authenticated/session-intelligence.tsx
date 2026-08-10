import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  MetricTile,
  Panel,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, sessionIntelligence } from "@/lib/intelligence";

export const Route = createFileRoute("/_authenticated/session-intelligence")({
  head: () => ({
    meta: [
      { title: "Session Intelligence — SaleemJournal" },
      {
        name: "description",
        content:
          "London, New York, Asian and overlap sessions compared with hourly profitability, hourly win rate and average RR by hour.",
      },
      { property: "og:title", content: "Session Intelligence — SaleemJournal" },
      { property: "og:description", content: "When your edge actually shows up during the trading day." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SessionIntelligencePage,
});

const tooltipStyle = {
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
};

function SessionIntelligencePage() {
  const { data: trades = [] } = useTrades();
  const data = useMemo(() => sessionIntelligence(trades), [trades]);
  const context = useMemo(
    () => packContext({ page: "Session intelligence", sampleSize: trades.length, sessions: data?.sessions }),
    [data, trades.length],
  );

  if (!data) {
    return (
      <InstitutionalPage
        title="Session Intelligence"
        description="Where your edge lives in the trading day"
        slug="session-intelligence"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Session intelligence", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const { sessions, hourly, weekday } = data;
  const maxAbs = Math.max(1, ...hourly.map((h) => Math.abs(h.pnl)));

  return (
    <InstitutionalPage
      title="Session Intelligence"
      description="London, New York, Asia and overlap compared hour by hour"
      slug="session-intelligence"
      csvRows={() => [
        ["Session", "Trades", "Net P/L", "Win rate", "Expectancy", "Avg RR"],
        ...sessions.map((s) => [s.name, s.trades, s.netPnl, `${s.winRate}%`, s.expectancy, s.avgRr ?? ""]),
        [],
        ["Hour (UTC)", "Trades", "Net P/L", "Win rate", "Avg RR"],
        ...hourly.map((h) => [h.label, h.trades, h.pnl, `${h.winRate}%`, h.avgRr]),
      ]}
      pdfSections={() => [
        {
          heading: "Session comparison",
          items: sessions.map(
            (s) => `${s.name}: ${s.trades} trades, $${s.netPnl}, ${s.winRate}% win rate, expectancy $${s.expectancy}`,
          ),
        },
      ]}
    >
      <Panel title="Session comparison" description="Only sessions you have actually traded are shown.">
        {sessions.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {sessions.map((s) => (
              <MetricTile
                key={s.name}
                label={s.name}
                value={`$${s.netPnl.toLocaleString()}`}
                rating={s.netPnl > 0 ? "good" : "poor"}
                ratingLabel={`${s.trades} trades`}
                plain={`${s.winRate.toFixed(1)}% win rate · ${s.avgRr ?? "—"}R average`}
                interpretation={`Expectancy of $${s.expectancy} per trade in this session.`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tag your trades with a session to unlock this comparison.</p>
        )}
      </Panel>

      <Panel title="Hourly profitability heatmap" description="Net P/L by hour of entry (UTC).">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {hourly.map((h) => {
            const intensity = Math.abs(h.pnl) / maxAbs;
            return (
              <div
                key={h.hour}
                className="rounded-lg border border-border/60 p-2 text-center transition-transform duration-300 hover:scale-105"
                style={{
                  background: h.trades
                    ? `color-mix(in oklab, var(${h.pnl >= 0 ? "--color-success" : "--color-destructive"}) ${Math.round(
                        12 + intensity * 60,
                      )}%, transparent)`
                    : "transparent",
                }}
                title={`${h.label} · ${h.trades} trades · $${h.pnl}`}
              >
                <p className="text-[10px] text-muted-foreground">{h.label}</p>
                <p className="num text-xs font-semibold">{h.trades ? `$${h.pnl}` : "—"}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Hourly win rate" description="Win rate for each hour you have entered trades.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly.filter((h) => h.trades > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis unit="%" domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {hourly
                    .filter((h) => h.trades > 0)
                    .map((h) => (
                      <Cell
                        key={h.hour}
                        fill={h.winRate >= 50 ? "var(--color-success)" : "var(--color-destructive)"}
                      />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Average RR by hour" description="Reward-to-risk achieved at each hour of the day.">
          <div className="chart-md">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly.filter((h) => h.trades > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="avgRr" stroke="var(--color-primary)" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Weekday profitability" description="Net P/L by day of week.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekday}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {weekday.map((d) => (
                  <Cell key={d.name} fill={d.pnl >= 0 ? "var(--color-primary)" : "var(--color-destructive)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <AiInterpretation kind="session" context={context} title="Saleem AI session read" />
    </InstitutionalPage>
  );
}
