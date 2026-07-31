import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { AiBadge, Meter, PoweredBy, RadialGauge } from "@/components/ai-ui";
import { psychMeters } from "@/lib/psych-metrics";
import { aiScore } from "@/lib/ai-score";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrades } from "@/hooks/use-trades";
import { groupBy, money, pct } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/psychology")({
  head: () => ({
    meta: [
      { title: "Psychology — SaleemJournal" },
      { name: "description", content: "Track how emotion and discipline shape your results." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Psychology,
});

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-foreground)",
};

const avg = (values: number[]) =>
  values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;

function Psychology() {
  const { data: trades, isLoading } = useTrades();

  const sorted = useMemo(
    () =>
      [...(trades ?? [])].sort(
        (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime(),
      ),
    [trades],
  );

  const radar = useMemo(() => {
    const list = trades ?? [];
    return [
      { trait: "Discipline", value: avg(list.map((t) => Number(t.discipline_level ?? 0))) },
      { trait: "Patience", value: avg(list.map((t) => Number(t.patience_level ?? 0))) },
      { trait: "Confidence", value: avg(list.map((t) => Number(t.confidence_level ?? 0))) },
      { trait: "Calm (inv. fear)", value: 10 - avg(list.map((t) => Number(t.fear_level ?? 0))) },
      {
        trait: "Restraint (inv. greed)",
        value: 10 - avg(list.map((t) => Number(t.greed_level ?? 0))),
      },
    ].map((r) => ({ ...r, value: Number(r.value.toFixed(2)) }));
  }, [trades]);

  const trend = useMemo(
    () =>
      sorted.map((t, i) => ({
        index: i + 1,
        discipline: Number(t.discipline_level ?? 0),
        fear: Number(t.fear_level ?? 0),
        greed: Number(t.greed_level ?? 0),
      })),
    [sorted],
  );

  const meters = useMemo(() => psychMeters(trades ?? []), [trades]);
  const psychology = useMemo(
    () => aiScore(trades ?? []).breakdown.find((b) => b.key === "psychology")?.value ?? null,
    [trades],
  );

  const byEmotion = useMemo(() => groupBy(trades ?? [], (t) => t.emotional_state), [trades]);
  const journalEntries = useMemo(
    () =>
      [...sorted]
        .reverse()
        .filter((t) => t.psychology_before || t.psychology_after)
        .slice(0, 12),
    [sorted],
  );

  if (isLoading) {
    return (
      <AppShell title="Psychology" description="Your mental edge, measured">
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-80 rounded-xl" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (!(trades ?? []).length) {
    return (
      <AppShell title="Psychology" description="Your mental edge, measured">
        <div className="surface-card p-14 text-center text-sm text-muted-foreground">
          Log trades with psychology notes to see emotional patterns emerge.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Psychology" description="Your mental edge, measured">
      <section className="ai-hero mb-4 grid gap-6 p-6 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center">
          <RadialGauge
            value={psychology}
            size={150}
            label="Psychology AI Score"
            sublabel="out of 100"
          />
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold">Mental edge meters</h2>
            <AiBadge label="AI measured" />
            <PoweredBy />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {meters.map((m) => (
              <Meter key={m.key} label={m.label} value={m.value} invert={m.invert} hint={m.hint} />
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Trader profile</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="trait"
                  stroke="var(--color-muted-foreground)"
                  fontSize={11}
                />
                <Radar
                  dataKey="value"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.35}
                />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Emotional trend over trades</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 10]} stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="discipline"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="fear"
                  stroke="var(--color-destructive)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="greed"
                  stroke="var(--color-chart-4)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Results by emotional state</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {byEmotion.map((e) => (
            <li key={e.name} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{e.name}</span>
                <Badge variant="outline">{e.trades} trades</Badge>
              </div>
              <p
                className={`num mt-2 text-lg font-semibold ${
                  e.pnl >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {money(e.pnl)}
              </p>
              <p className="text-xs text-muted-foreground">Win rate {pct(e.winRate)}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="surface-card mt-4 p-5">
        <h2 className="text-sm font-semibold">Recent mindset notes</h2>
        {journalEntries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Add psychology notes when logging a trade to build this timeline.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {journalEntries.map((t) => (
              <li key={t.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t.asset}</span>
                  <span>{new Date(t.opened_at).toLocaleDateString()}</span>
                  {t.emotional_state && (
                    <Badge variant="outline" className="capitalize">
                      {t.emotional_state}
                    </Badge>
                  )}
                </div>
                {t.psychology_before && (
                  <p className="mt-2 text-sm">
                    <span className="text-muted-foreground">Before: </span>
                    {t.psychology_before}
                  </p>
                )}
                {t.psychology_after && (
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">After: </span>
                    {t.psychology_after}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
