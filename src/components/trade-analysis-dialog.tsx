import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ConfidenceCard,
  DetectedList,
  EmptyState,
  FlagList,
  GradePill,
  ScoreBars,
  Section,
} from "@/components/analysis-blocks";
import { AiBadge, AiCard, AiChip, PoweredBy, RadialGauge } from "@/components/ai-ui";
import { analyzeTrade } from "@/lib/ai-analysis.functions";
import { tradeContext } from "@/lib/analysis-context";
import { dataSufficiency, detectMistakes, detectStrengths } from "@/lib/rules-engine";
import { exportReportPdf } from "@/lib/report-export";
import type { TradeAnalysis } from "@/lib/analysis-types";
import { money, type Trade } from "@/lib/trades";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

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

  const evidence = useMemo(() => {
    if (!trade) return null;
    return {
      mistakes: detectMistakes(trade, trades),
      strengths: detectStrengths(trade, trades),
      sufficiency: dataSufficiency(trade, trades),
    };
  }, [trade, trades]);

  const mutation = useMutation({
    mutationFn: async (target: Trade) =>
      (await run({ data: { context: tradeContext(target, trades) } })) as TradeAnalysis,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Analysis failed"),
  });

  const { mutate, reset } = mutation;
  useEffect(() => {
    if (open && trade) mutate(trade);
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trade?.id]);

  const a = mutation.data;

  const executionAvg = useMemo(() => {
    const scores = (a?.executionScores ?? []).map((s) => Number(s.score)).filter(Number.isFinite);
    return scores.length
      ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10)
      : null;
  }, [a]);

  function exportPdf() {
    if (!a || !trade) return;
    const detected = (items?: { title: string; explanation: string }[]) =>
      (items ?? []).map((d) => `${d.title} — ${d.explanation}`);
    exportReportPdf({
      title: `AI Trade Report · ${trade.asset}`,
      subtitle: `${new Date(trade.opened_at).toLocaleString()} · ${trade.direction} · ${money(Number(trade.profit_loss))}`,
      sections: [
        { heading: "Trade summary", body: a.summary },
        { heading: "Overall grade", body: `${a.grade?.label ?? "—"} — ${a.grade?.reason ?? ""}` },
        {
          heading: "Execution analysis",
          items: (a.executionScores ?? []).map((s) => `${s.name}: ${s.score}/10 — ${s.comment}`),
        },
        {
          heading: "Psychology analysis",
          body: a.psychology?.assessment,
          items: detected(a.psychology?.factors),
        },
        { heading: "Mistakes", items: detected(a.mistakes) },
        { heading: "Strengths", items: detected(a.strengths) },
        { heading: "Performance insights", items: detected(a.performanceInsights) },
        { heading: "Pattern recognition", items: detected(a.patterns) },
        {
          heading: "Risk analysis",
          body: a.riskAnalysis?.assessment,
          items: detected(a.riskAnalysis?.recommendations),
        },
        { heading: "Recommendations", items: detected(a.recommendations) },
        {
          heading: "Confidence",
          body: `${a.confidence?.percent ?? 0}% — ${a.confidence?.reason ?? ""}`,
        },
        { heading: "Next trade checklist", items: a.checklist ?? [] },
      ],
    });
  }

  const rr = n(trade?.rr_ratio);
  const risk = n(trade?.risk_percent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[94vh] max-w-[min(1180px,96vw)] overflow-y-auto sm:max-w-[min(1180px,96vw)]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI trade analysis {trade ? `— ${trade.asset}` : ""}
            <AiBadge />
          </DialogTitle>
          <DialogDescription>
            Evidence-based review of this trade against your full journal history.
          </DialogDescription>
        </DialogHeader>

        {trade ? (
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Fact label="Direction" value={trade.direction} />
            <Fact label="Entry" value={trade.entry_price ? String(trade.entry_price) : "—"} />
            <Fact label="Exit" value={trade.exit_price ? String(trade.exit_price) : "—"} />
            <Fact label="Stop loss" value={trade.stop_loss ? String(trade.stop_loss) : "none"} />
            <Fact
              label="Position size"
              value={trade.position_size ? String(trade.position_size) : "—"}
            />
            <Fact label="Result" value={money(Number(trade.profit_loss))} />
          </div>
        ) : null}

        {evidence ? (
          <AiCard title="Rule-based detection" icon={<Sparkles className="h-4 w-4 text-primary" />}>
            <div className="space-y-3">
              <FlagList items={evidence.mistakes} tone="bad" />
              <FlagList items={evidence.strengths} tone="good" />
              <div className="flex flex-wrap gap-2">
                <AiChip>{risk === null ? "Risk not logged" : `Risk ${risk}%`}</AiChip>
                <AiChip>{rr === null ? "RR not logged" : `${rr}R planned`}</AiChip>
                <AiChip>
                  {trade?.session ? `${trade.session} session` : "Session not logged"}
                </AiChip>
                <AiChip>{trade?.emotional_state ?? "Emotion not logged"}</AiChip>
              </div>
              <p className="text-xs text-muted-foreground">{evidence.sufficiency.reason}</p>
            </div>
          </AiCard>
        ) : null}

        {mutation.isPending ? (
          <div className="space-y-3 py-10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analysing execution, risk and psychology…
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="ai-pulse h-16 rounded-xl bg-muted" />
            ))}
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
          <div className="space-y-6 animate-in fade-in duration-300">
            {a.insufficientData ? <EmptyState /> : null}

            <div className="ai-hero grid gap-6 p-6 lg:grid-cols-[auto_1fr_auto]">
              <RadialGauge
                value={a.confidence?.percent ?? evidence?.sufficiency.percent ?? null}
                size={128}
                label="AI confidence"
              />
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <GradePill label={a.grade?.label} />
                  <PoweredBy />
                </div>
                <p className="text-sm leading-relaxed">{a.summary}</p>
                {a.grade?.reason ? (
                  <p className="text-sm text-muted-foreground">{a.grade.reason}</p>
                ) : null}
                <Button size="sm" variant="outline" className="no-print" onClick={exportPdf}>
                  <Download className="mr-2 h-3.5 w-3.5" /> Export PDF
                </Button>
              </div>
              <RadialGauge value={executionAvg} size={128} label="Execution quality" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AiCard title="Execution analysis">
                <ScoreBars scores={a.executionScores} />
              </AiCard>

              <div className="space-y-4">
                <AiCard title="Entry & exit analysis">
                  <DetectedList
                    items={a.performanceInsights}
                    empty="No entry/exit insight returned."
                  />
                </AiCard>
                <AiCard title="Risk & position size">
                  <p className="text-sm leading-relaxed">{a.riskAnalysis?.assessment}</p>
                  <div className="mt-3">
                    <DetectedList items={a.riskAnalysis?.recommendations} />
                  </div>
                </AiCard>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <AiCard title="Psychology & emotion detection">
                <p className="text-sm leading-relaxed">{a.psychology?.assessment}</p>
                <div className="mt-3">
                  <DetectedList items={a.psychology?.factors} />
                </div>
              </AiCard>
              <AiCard title="Pattern recognition">
                <DetectedList items={a.patterns} />
              </AiCard>
              <AiCard title="Mistakes detected">
                <DetectedList items={a.mistakes} tone="bad" empty="No mistakes detected." />
              </AiCard>
              <AiCard title="Strengths">
                <DetectedList items={a.strengths} tone="good" />
              </AiCard>
            </div>

            {a.capitalPreservation ? (
              <AiCard title="Capital preservation">
                <p className="text-sm leading-relaxed">{a.capitalPreservation.assessment}</p>
                <div className="mt-3">
                  <DetectedList items={a.capitalPreservation.points} empty="" />
                </div>
              </AiCard>
            ) : null}

            {a.behavioral ? (
              <AiCard title="Behavioral analysis">
                <p className="text-sm leading-relaxed">{a.behavioral.assessment}</p>
                <div className="mt-3">
                  <DetectedList items={a.behavioral.points} empty="" />
                </div>
              </AiCard>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <AiCard title="Explainable recommendations">
                <DetectedList items={a.recommendations} />
              </AiCard>
              <div className="space-y-4">
                <AiCard title="AI coach notes">
                  <Section title="">
                    <ul className="space-y-1">
                      {(a.psychologyCoach ?? []).map((m, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          • {m}
                        </li>
                      ))}
                    </ul>
                  </Section>
                </AiCard>
                <AiCard title="Next trade checklist">
                  <ul className="space-y-1">
                    {(a.checklist ?? []).map((c, i) => (
                      <li key={i} className="text-sm">
                        ☐ {c}
                      </li>
                    ))}
                  </ul>
                </AiCard>
              </div>
            </div>

            <ConfidenceCard
              confidence={a.confidence}
              sampleSize={evidence?.sufficiency.sampleSize}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
