import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { AiInsightPanel } from "@/components/ai-insight-panel";
import { AiBadge, AiChip, PoweredBy, ScoreRing } from "@/components/ai-ui";
import { aiScore, dashboardWidgets, periodScore } from "@/lib/ai-score";
import { TradeDialog } from "@/components/trade-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrades } from "@/hooks/use-trades";
import { computeStats, money, pct } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — SaleemJournal" },
      { name: "description", content: "Your trading performance at a glance." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "up" | "down";
  hint?: string;
}) {
  return (
    <div className="surface-card p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground sm:text-xs">{label}</p>
      <p
        className={cn(
          "num mt-2 text-xl font-semibold sm:text-2xl",
          tone === "up" && "text-success",
          tone === "down" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Calendar({ days }: { days: Map<string, number> }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const first = new Date(year, month, 1);
  const total = new Date(year, month + 1, 0).getDate();
  const lead = first.getDay();

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {first.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" /> Green
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" /> Red
          </span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: total }).map((_, i) => {
          const day = i + 1;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const pnl = days.get(key);
          return (
            <div
              key={key}
              title={pnl !== undefined ? `${key}: ${money(pnl)}` : key}
              className={cn(
                "num grid aspect-square place-items-center rounded-md border border-border text-xs",
                pnl === undefined && "text-muted-foreground/50",
                pnl !== undefined && pnl > 0 && "border-success/40 bg-success/15 text-success",
                pnl !== undefined &&
                  pnl < 0 &&
                  "border-destructive/40 bg-destructive/15 text-destructive",
              )}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: trades, isLoading } = useTrades();
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => computeStats(trades ?? []), [trades]);
  const list = useMemo(() => trades ?? [], [trades]);
  const score = useMemo(() => aiScore(list), [list]);
  const today = useMemo(() => periodScore(list, 1), [list]);
  const week = useMemo(() => periodScore(list, 7), [list]);
  const month = useMemo(() => periodScore(list, 30), [list]);
  const widgets = useMemo(() => dashboardWidgets(list), [list]);

  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trades ?? []) {
      const key = new Date(t.opened_at).toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + Number(t.profit_loss || 0));
    }
    return map;
  }, [trades]);

  return (
    <AppShell
      title="Dashboard"
      description="Performance overview across every logged trade"
      actions={
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Log trade
        </Button>
      }
    >
      <TradeDialog open={open} onOpenChange={setOpen} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : stats.total === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 p-14 text-center">
          <h2 className="text-lg font-semibold">No trades yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Log your first trade to unlock win rate, equity curve, streaks and psychology trends.
          </p>
          <Button onClick={() => setOpen(true)} className="mt-2">
            <Plus className="mr-2 h-4 w-4" /> Log your first trade
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <AiInsightPanel trades={list} score={score.overall} />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">AI score system</h2>
              <AiBadge label="AI scored" />
              <PoweredBy />
            </div>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
              <ScoreRing value={today.score} label={`Today (${today.trades})`} />
              <ScoreRing value={week.score} label={`This week (${week.trades})`} />
              <ScoreRing value={month.score} label={`This month (${month.trades})`} />
              {score.breakdown.map((b) => (
                <ScoreRing key={b.key} value={b.value} label={b.label} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">AI widgets</h2>
              <AiChip>Evidence based</AiChip>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {widgets.map((w) => (
                <div
                  key={w.label}
                  className="ai-surface p-4 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{w.label}</p>
                  <p
                    className={cn(
                      "mt-1.5 truncate text-base font-semibold capitalize",
                      w.tone === "good" && "text-success",
                      w.tone === "bad" && "text-destructive",
                    )}
                  >
                    {w.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{w.hint}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label="Total trades" value={String(stats.total)} />
            <Stat label="Win rate" value={pct(stats.winRate)} tone="up" />
            <Stat label="Loss rate" value={pct(stats.lossRate)} tone="down" />
            <Stat
              label="Net P/L"
              value={money(stats.netPnl)}
              tone={stats.netPnl >= 0 ? "up" : "down"}
            />
            <Stat label="Average RR" value={stats.avgRr ? `${stats.avgRr.toFixed(2)}R` : "—"} />
            <Stat
              label="Best trade"
              value={stats.best ? money(Number(stats.best.profit_loss)) : "—"}
              tone="up"
              hint={stats.best?.asset}
            />
            <Stat
              label="Worst trade"
              value={stats.worst ? money(Number(stats.worst.profit_loss)) : "—"}
              tone="down"
              hint={stats.worst?.asset}
            />
            <Stat
              label="Current streak"
              value={
                stats.streak === 0
                  ? "—"
                  : `${Math.abs(stats.streak)} ${stats.streak > 0 ? "wins" : "losses"}`
              }
              tone={stats.streak > 0 ? "up" : stats.streak < 0 ? "down" : "neutral"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="surface-card p-5 lg:col-span-2">
              <h2 className="text-sm font-semibold">Equity curve</h2>
              <div className="mt-4 chart-md">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.equityCurve}>
                    <defs>
                      <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="index" stroke="var(--color-muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={54} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      fill="url(#eq)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <Calendar days={days} />
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent trades</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/journal">View all</Link>
              </Button>
            </div>
            <ul className="mt-4 divide-y divide-border">
              {(trades ?? []).slice(0, 6).map((t) => {
                const pnl = Number(t.profit_loss);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.asset}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.opened_at).toLocaleDateString()} · {t.strategy || t.market}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="capitalize">
                        {t.direction}
                      </Badge>
                      <span
                        className={cn(
                          "num flex items-center gap-1 text-sm font-medium",
                          pnl >= 0 ? "text-success" : "text-destructive",
                        )}
                      >
                        {pnl >= 0 ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {money(pnl)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </AppShell>
  );
}
