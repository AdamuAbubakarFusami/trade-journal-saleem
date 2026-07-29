import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DetectedList, GradePill, ScoreBars, Section } from "@/components/analysis-blocks";
import { analyzeTrade } from "@/lib/ai-analysis.functions";
import { buildHistory, packContext, recentTrades, serializeTrade } from "@/lib/analysis-context";
import type { TradeAnalysis } from "@/lib/analysis-types";
import type { Trade } from "@/lib/trades";

export function TradeAnalysisDialog({
  trade,
  trades,
  open,
  onOpenChange,
}: {
  trade: Trade | null;
  trades: Trade[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const run = useServerFn(analyzeTrade);

  const mutation = useMutation({
    mutationFn: async (target: Trade) => {
      const context = packContext({
        trade: serializeTrade(target),
        history: buildHistory(trades),
        recent: recentTrades(trades, 25),
      });
      return (await run({ data: { context } })) as TradeAnalysis;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analysis failed"),
  });

  const { mutate, reset } = mutation;
  useEffect(() => {
    if (open && trade) mutate(trade);
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trade?.id]);

  const a = mutation.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI trade analysis {trade ? `— ${trade.asset}` : ""}
          </DialogTitle>
          <DialogDescription>
            Evidence-based review of this trade against your full journal history.
          </DialogDescription>
        </DialogHeader>

        {mutation.isPending ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Analysing execution, risk and psychology…
          </div>
        ) : mutation.isError ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {mutation.error instanceof Error ? mutation.error.message : "Analysis failed"}
            </p>
            <Button variant="outline" onClick={() => trade && mutation.mutate(trade)}>
              Try again
            </Button>
          </div>
        ) : a ? (
          <div className="space-y-6">
            {a.insufficientData ? (
              <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                Not enough trading data yet — log more trades for higher-confidence coaching.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <GradePill label={a.grade?.label} />
              {a.confidence ? (
                <span className="text-xs text-muted-foreground">
                  Confidence: {a.confidence.percent}% — {a.confidence.reason}
                </span>
              ) : null}
            </div>

            <Section title="Trade summary">
              <p className="text-sm leading-relaxed">{a.summary}</p>
              {a.grade?.reason ? (
                <p className="text-sm text-muted-foreground">{a.grade.reason}</p>
              ) : null}
            </Section>

            <Section title="Execution score">
              <ScoreBars scores={a.executionScores} />
            </Section>

            <Section title="Psychology analysis">
              <p className="text-sm leading-relaxed">{a.psychology?.assessment}</p>
              <DetectedList items={a.psychology?.factors} />
            </Section>

            <Section title="Mistakes detected">
              <DetectedList items={a.mistakes} tone="bad" empty="No mistakes detected." />
            </Section>

            <Section title="Strengths">
              <DetectedList items={a.strengths} tone="good" />
            </Section>

            <Section title="Performance insights">
              <DetectedList items={a.performanceInsights} />
            </Section>

            <Section title="Pattern recognition">
              <DetectedList items={a.patterns} />
            </Section>

            <Section title="Risk analysis">
              <p className="text-sm leading-relaxed">{a.riskAnalysis?.assessment}</p>
              <DetectedList items={a.riskAnalysis?.recommendations} />
            </Section>

            <Section title="Psychology coach">
              <ul className="space-y-1">
                {(a.psychologyCoach ?? []).map((m, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    • {m}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="AI recommendations">
              <DetectedList items={a.recommendations} />
            </Section>

            <Section title="Next trade checklist">
              <ul className="space-y-1">
                {(a.checklist ?? []).map((c, i) => (
                  <li key={i} className="text-sm">
                    ☐ {c}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
