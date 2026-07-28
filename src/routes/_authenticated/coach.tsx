import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTrades } from "@/hooks/use-trades";
import { askCoach } from "@/lib/coach.functions";
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
  const ask = useServerFn(askCoach);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const summary = useMemo(() => {
    const list = trades ?? [];
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
  }, [trades]);

  const mutation = useMutation({
    mutationFn: async (q: string) => ask({ data: { question: q, summary } }),
    onSuccess: (res) => setAnswer(res.answer),
    onError: (e) => toast.error(e instanceof Error ? e.message : "The coach is unavailable"),
  });

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return toast.error("Ask a question first");
    if (!summary.total) return toast.error("Log some trades first so the coach has data");
    setQuestion(trimmed);
    mutation.mutate(trimmed.slice(0, 500));
  }

  return (
    <AppShell title="AI Coach" description="Coaching grounded in your own journal data">
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Quick prompts</p>
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
    </AppShell>
  );
}
