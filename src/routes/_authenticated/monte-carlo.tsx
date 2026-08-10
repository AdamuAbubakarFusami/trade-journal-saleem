import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
import { Button } from "@/components/ui/button";
import { useTrades } from "@/hooks/use-trades";
import { MIN_TRADES, monteCarlo } from "@/lib/institutional";
import { packContext } from "@/lib/analysis-context";
import { money } from "@/lib/trades";

const RUN_OPTIONS = [1000, 5000, 10000] as const;

export const Route = createFileRoute("/_authenticated/monte-carlo")({
  head: () => ({
    meta: [
      { title: "Monte Carlo Simulation — SaleemJournal" },
      {
        name: "description",
        content:
          "Run up to 10,000 Monte Carlo resamples of your own trade outcomes to see equity confidence bands, expected drawdown and best/worst cases.",
      },
      { property: "og:title", content: "Monte Carlo Simulation — SaleemJournal" },
      {
        property: "og:description",
        content: "Confidence bands and drawdown expectations resampled from your journal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MonteCarloPage,
});

function MonteCarloPage() {
  const { data: trades = [] } = useTrades();
  const [runs, setRuns] = useState<number>(10000);
  const [seed, setSeed] = useState(0);
  const mc = useMemo(
    () => monteCarlo(trades, runs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trades, runs, seed],
  );

  const context = useMemo(
    () =>
      packContext({
        page: "Monte Carlo simulation",
        simulation: mc
          ? {
              runs: mc.runs,
              horizon: mc.horizon,
              startCapital: mc.startCapital,
              medianFinal: mc.finalMedian,
              ci95: mc.ci95,
              probProfit: mc.probProfit,
              expectedDrawdown: mc.expectedDrawdown,
              maxExpectedDrawdown: mc.maxExpectedDrawdown,
            }
          : null,
        sampleSize: trades.length,
      }),
    [mc, trades.length],
  );

  if (!mc) {
    return (
      <InstitutionalPage
        title="Monte Carlo"
        description="Resampling your own trade outcomes"
        slug="monte-carlo"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Monte Carlo", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  const sampleKeys = Object.keys(mc.samples[0] ?? {}).filter((k) => k !== "step");

  return (
    <InstitutionalPage
      title="Monte Carlo"
      description={`${mc.runs.toLocaleString()} simulations × ${mc.horizon} trades, resampled from your own results`}
      slug="monte-carlo"
      csvRows={() => [
        ["Step", "Worst", "P5", "P25", "Median", "P75", "P95", "Best"],
        ...mc.bands.map((b) => [b.step, b.worst, b.p5, b.p25, b.median, b.p75, b.p95, b.best]),
      ]}
      pdfSections={() => [
        {
          heading: "Simulation setup",
          body: `${mc.runs.toLocaleString()} bootstrap simulations over ${mc.horizon} trades, starting from an estimated ${mc.startCapital.toLocaleString()} account.`,
        },
        {
          heading: "Outcome envelope",
          items: [
            `Median final equity: ${money(mc.finalMedian)}`,
            `95% confidence interval: ${money(mc.ci95[0])} to ${money(mc.ci95[1])}`,
            `Best case: ${money(mc.finalBest)} / worst case: ${money(mc.finalWorst)}`,
            `Probability of finishing profitable: ${mc.probProfit}%`,
            `Median simulated drawdown: ${money(mc.expectedDrawdown)}`,
            `Deepest simulated drawdown: ${money(mc.maxExpectedDrawdown)}`,
          ],
        },
      ]}
    >
      <Panel
        title="Simulation controls"
        description="Each run reshuffles your historical trade outcomes — it projects your statistics, never the market."
        actions={
          <div className="flex flex-wrap gap-2" data-export-ignore="true">
            {RUN_OPTIONS.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={runs === r ? "default" : "outline"}
                onClick={() => setRuns(r)}
              >
                {r.toLocaleString()} runs
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={() => setSeed((s) => s + 1)}>
              Re-run
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricTile
            label="Median final equity"
            value={money(mc.finalMedian)}
            rating={mc.finalMedian >= mc.startCapital ? "good" : "poor"}
            ratingLabel={mc.finalMedian >= mc.startCapital ? "Growing" : "Eroding"}
            plain="The middle outcome across every simulation."
            interpretation={`Half of the ${mc.runs.toLocaleString()} simulated futures finish above ${money(mc.finalMedian)} starting from ${money(mc.startCapital)}.`}
          />
          <MetricTile
            label="95% confidence interval"
            value={`${money(mc.ci95[0])} → ${money(mc.ci95[1])}`}
            plain="Where 95 of 100 simulated outcomes land."
            interpretation="A wide interval means your results are volatile and require smaller position sizing to survive the tails."
          />
          <MetricTile
            label="Probability of profit"
            value={`${mc.probProfit}%`}
            rating={mc.probProfit > 70 ? "excellent" : mc.probProfit > 50 ? "good" : "poor"}
            ratingLabel={mc.probProfit > 50 ? "Positive edge" : "Negative edge"}
            plain="Simulations ending above the starting balance."
            interpretation={`${mc.probProfit}% of resampled sequences end profitable after ${mc.horizon} trades.`}
          />
          <MetricTile
            label="Best case"
            value={money(mc.finalBest)}
            plain="Most favourable ordering of your own trades."
            interpretation="Best case is a lucky sequence, not a target — do not size for it."
          />
          <MetricTile
            label="Worst case"
            value={money(mc.finalWorst)}
            rating="poor"
            ratingLabel="Tail risk"
            plain="Least favourable ordering of your own trades."
            interpretation="Your risk plan must remain viable at this outcome; that is the purpose of the simulation."
          />
          <MetricTile
            label="Expected drawdown"
            value={money(mc.expectedDrawdown)}
            plain="Median worst peak-to-trough loss per simulation."
            interpretation={`Deepest simulated drawdown reached ${money(mc.maxExpectedDrawdown)} — plan psychologically for that depth.`}
          />
        </div>
      </Panel>

      <Panel title="Equity confidence bands" description="P5 / P25 / median / P75 / P95 envelope.">
        <div className="chart-lg">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mc.bands}>
              <defs>
                <linearGradient id="mcOuter" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="step" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Area dataKey="p95" stroke="none" fill="url(#mcOuter)" />
              <Area dataKey="p75" stroke="none" fill="var(--color-primary)" fillOpacity={0.15} />
              <Area dataKey="p25" stroke="none" fill="var(--color-card)" fillOpacity={0.9} />
              <Area dataKey="p5" stroke="none" fill="var(--color-card)" fillOpacity={0.95} />
              <Line dataKey="median" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
              <ReferenceLine y={mc.startCapital} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Sample simulated paths" description="Twelve individual futures drawn from your own trade population.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mc.samples}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="step" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              {sampleKeys.map((k, i) => (
                <Line
                  key={k}
                  dataKey={k}
                  dot={false}
                  strokeWidth={1.2}
                  stroke={`var(--color-chart-${(i % 5) + 1})`}
                  strokeOpacity={0.7}
                />
              ))}
              <ReferenceLine y={mc.startCapital} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Distribution of final outcomes" description="How the simulated ending balances cluster.">
        <div className="chart-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mc.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <AiInterpretation kind="risk" context={context} title="Saleem AI simulation read" />
    </InstitutionalPage>
  );
}
