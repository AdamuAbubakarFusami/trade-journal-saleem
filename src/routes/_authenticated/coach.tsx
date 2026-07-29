import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetectedList, GradePill, Section } from "@/components/analysis-blocks";
import { useTrades } from "@/hooks/use-trades";
import { askCoach } from "@/lib/coach.functions";
import { buildTraderProfile, generatePeriodReport } from "@/lib/ai-analysis.functions";
import {
  buildHistory,
  packContext,
  recentTrades,
  withinDays,
} from "@/lib/analysis-context";
import type { PeriodReport, TraderProfile } from "@/lib/analysis-types";
import { computeStats, groupBy } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/coach")({
  head: () => ({
    meta: [
      { title: "AI Coach — SaleemJournal" },
      { name: "description", content: "Get AI coaching based on your own trading data." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Coach,
});

const PROMPTS = [
  "What is the biggest leak in my trading right now?",
  "Which setup should I trade more, and which should I cut?",
  "How is my psychology affecting my results?",
  "Design a one-week plan to improve my discipline.",
];

const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

function Coach() {
  const { data: trades } = useTrades();
  const list = useMemo(() => trades ?? [], [trades]);
  const ask = useServerFn(askCoach);
  const runPeriod = useServerFn(generatePeriodReport);
  const runProfile = useServerFn(buildTraderProfile);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const summary = useMemo(() => {
    const s = computeStats(list);
    return {
      total: s.total,
      winRate: Number(s.winRate.toFixed(2)),
      netPnl: Number(s.netPnl.toFixed(2)),
      avgRr: Number(s.avgRr.toFixed(2)),
      profitFactor: Number.isFinite(s.profitFactor) ? Number(s.profitFactor.toFixed(2)) : 99,
      avgWin: Number(s.avgWin.toFixed(2)),
      avgLoss: Number(s.avgLoss.toFixed(2)),
      streak: s.streak,
      topStrategies: groupBy(list, (t) => t.strategy)
        .slice(0, 8)
        .map((g) => ({ name: g.name, pnl: g.pnl, winRate: Number(g.winRate.toFixed(1)) })),
      emotions: groupBy(list, (t) => t.emotional_state)
        .slice(0, 8)
        .map((g) => ({ name: g.name, pnl: g.pnl, winRate: Number(g.winRate.toFixed(1)) })),
      avgDiscipline: Number(avg(list.map((t) => Number(t.discipline_level ?? 0))).toFixed(2)),
      avgFear: Number(avg(list.map((t) => Number(t.fear_level ?? 0))).toFixed(2)),
      avgGreed: Number(avg(list.map((t) => Number(t.greed_level ?? 0))).toFixed(2)),
    };
  }, [list]);

  const mutation = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, summary } }),
    onSuccess: (res) => setAnswer(res.answer),
    onError: (e) => toast.error(e instanceof Error ? e.message : "The coach is unavailable"),
  });

  const weekly = useMutation({
    mutationFn: async () => {
      const window = withinDays(list, 7);
      const context = packContext({
        period: "last 7 days",
        periodStats: buildHistory(window),
        previousPeriodStats: buildHistory(
          withinDays(list, 14).filter((t) => !window.includes(t)),
        ),
        allTimeStats: buildHistory(list),
        trades: recentTrades(window, 40),
      });
      return (await runPeriod({ data: { context, period: "weekly" } })) as PeriodReport;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Report failed"),
  });

  const monthly = useMutation({
    mutationFn: async () => {
      const window = withinDays(list, 30);
      const context = packContext({
        period: "last 30 days",
        periodStats: buildHistory(window),
        previousPeriodStats: buildHistory(
          withinDays(list, 60).filter((t) => !window.includes(t)),
        ),
        allTimeStats: buildHistory(list),
        trades: recentTrades(window, 60),
      });
      return (await runPeriod({ data: { context, period: "monthly" } })) as PeriodReport;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Report failed"),
  });

  const profile = useMutation({
    mutationFn: async () => {
      const context = packContext({
        allTimeStats: buildHistory(list),
        last30: buildHistory(withinDays(list, 30)),
        last90: buildHistory(withinDays(list, 90)),
        recent: recentTrades(list, 40),
      });
      return (await runProfile({ data: { context } })) as TraderProfile;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Profile failed"),
  });

  function guard() {
    if (!list.length) {
      toast.error("Not enough trading data yet — log some trades first");
      return false;
    }
    return true;
  }

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return toast.error("Ask a question first");
    if (!guard()) return;
    setQuestion(trimmed);
    mutation.mutate(trimmed.slice(0, 500));
  }

  return (
    <AppShell title="AI Coach" description="Coaching grounded in your own journal data">
      <Tabs defaultValue="ask">
        <TabsList className="mb-4">
          <TabsTrigger value="ask">Ask coach</TabsTrigger>
          <TabsTrigger value="weekly">Weekly report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly report</TabsTrigger>
          <TabsTrigger value="profile">Trader profile</TabsTrigger>
        </TabsList>

        <TabsContent value="ask">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="surface-card space-y-4 p-6">
              <h2 className="text-sm font-semibold">Ask your coach</h2>
              <Textarea
                rows={5}
                maxLength={500}
                placeholder="e.g. Why do my London session trades underperform?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button
                className="w-full"
                onClick={() => submit(question)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Get coaching
              </Button>
              <div className="space-y-2 pt-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Quick prompts
                </p>
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => submit(p)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="text-sm font-semibold">Coach response</h2>
              {mutation.isPending ? (
                <p className="mt-4 text-sm text-muted-foreground">Analysing your journal…</p>
              ) : answer ? (
                <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{answer}</div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Your coach reads your aggregated stats — win rate, RR, strategy performance and
                  psychology scores — then tells you exactly what to fix next.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="weekly">
          <ReportPanel
            title="Weekly report"
            blurb="Last 7 days: best and worst strategies and sessions, top mistake, psychology trend and an overall grade."
            state={weekly}
            onRun={() => guard() && weekly.mutate()}
          />
        </TabsContent>

        <TabsContent value="monthly">
          <ReportPanel
            title="Monthly report"
            blurb="Last 30 days: profit, loss, expectancy, drawdown, consistency and improvement versus the prior month."
            state={monthly}
            onRun={() => guard() && monthly.mutate()}
          />
        </TabsContent>

        <TabsContent value="profile">
          <div className="surface-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">AI trader profile</h2>
                <p className="text-sm text-muted-foreground">
                  Your archetype, traits and long-term growth trends across discipline, emotion and
                  risk.
                </p>
              </div>
              <Button onClick={() => guard() && profile.mutate()} disabled={profile.isPending}>
                {profile.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Build profile
              </Button>
            </div>

            {profile.data ? (
              <div className="space-y-6 pt-2">
                {profile.data.insufficientData ? (
                  <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    Not enough trading data yet.
                  </p>
                ) : null}
                <Section title="Archetype">
                  <p className="text-lg font-semibold text-gradient">{profile.data.archetype}</p>
                  <p className="text-sm text-muted-foreground">{profile.data.reason}</p>
                </Section>
                <Section title="Traits">
                  <DetectedList items={profile.data.traits} />
                </Section>
                <Section title="Long-term growth">
                  <DetectedList items={profile.data.growth} />
                </Section>
                <Section title="Focus next">
                  <DetectedList items={profile.data.focusNext} />
                </Section>
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ReportPanel({
  title,
  blurb,
  state,
  onRun,
}: {
  title: string;
  blurb: string;
  state: { data?: PeriodReport; isPending: boolean };
  onRun: () => void;
}) {
  const r = state.data;
  return (
    <div className="surface-card space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>
        <Button onClick={onRun} disabled={state.isPending}>
          {state.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>

      {r ? (
        <div className="space-y-6 pt-2">
          {r.insufficientData ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              Not enough trading data yet.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <GradePill label={r.overallGrade?.label} />
            <span className="text-xs text-muted-foreground">{r.overallGrade?.reason}</span>
          </div>

          <Section title="Summary">
            <p className="text-sm leading-relaxed">{r.summary}</p>
          </Section>

          <Section title="Metrics">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(r.metrics ?? []).map((m, i) => (
                <div key={`${m?.label}-${i}`} className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {m?.label}
                  </p>
                  <p className="num mt-1 text-sm font-medium">{m?.value}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Highlights">
            <DetectedList
              items={[r.bestStrategy, r.bestSession].filter(Boolean) as never}
              tone="good"
            />
          </Section>

          <Section title="Weak points">
            <DetectedList
              items={[r.worstStrategy, r.worstSession, r.topMistake].filter(Boolean) as never}
              tone="bad"
            />
          </Section>

          <Section title="Psychology trend">
            <p className="text-sm leading-relaxed">{r.psychologyTrend}</p>
          </Section>

          <Section title="Recommendations">
            <DetectedList items={r.recommendations} />
          </Section>
        </div>
      ) : null}
    </div>
  );
}
