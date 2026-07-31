import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { BrainCircuit, Loader2, RefreshCw } from "lucide-react";

import { AiBadge, AiChip, AiStatus, PoweredBy, RadialGauge } from "@/components/ai-ui";
import { Button } from "@/components/ui/button";
import { runAnalyzer } from "@/lib/ai-analysis.functions";
import { analyzerContext } from "@/lib/analysis-context";
import { dataSufficiency } from "@/lib/rules-engine";
import type { AnalyzerReport } from "@/lib/analysis-types";
import type { Trade } from "@/lib/trades";

/**
 * Dashboard hero: one AI-generated daily insight grounded in the journal,
 * shown next to the deterministic overall AI score.
 */
export function AiInsightPanel({ trades, score }: { trades: Trade[]; score: number | null }) {
  const run = useServerFn(runAnalyzer);
  const sufficiency = dataSufficiency(null, trades);

  const mutation = useMutation({
    mutationFn: async () =>
      (await run({
        data: { context: analyzerContext(trades), kind: "performance" },
      })) as AnalyzerReport,
  });

  const { mutate } = mutation;
  useEffect(() => {
    if (trades.length) mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades.length]);

  const report = mutation.data;
  const confidence = report?.confidence?.percent ?? sufficiency.percent;

  return (
    <section className="ai-hero grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <h2 className="font-display text-lg font-semibold">AI Daily Insight</h2>
          <AiBadge />
          <AiStatus
            active={mutation.isPending}
            label={mutation.isPending ? "Analysing journal…" : "Insight ready"}
          />
        </div>

        {mutation.isPending ? (
          <div className="space-y-2">
            <div className="ai-pulse h-4 w-3/4 rounded bg-muted" />
            <div className="ai-pulse h-4 w-2/3 rounded bg-muted" />
            <div className="ai-pulse h-4 w-1/2 rounded bg-muted" />
          </div>
        ) : mutation.isError ? (
          <p className="text-sm text-muted-foreground">
            Insight unavailable right now. Try refreshing the analysis.
          </p>
        ) : report ? (
          <div className="space-y-3">
            <p className="text-base font-medium leading-relaxed">
              {report.insufficientData ? "Not enough trading data yet." : report.headline}
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {report.insufficientData
                ? "Log at least 20 trades to unlock advanced AI insights."
                : report.summary}
            </p>
            <div className="flex flex-wrap gap-2">
              {(report.findings ?? []).slice(0, 3).map((f, i) => (
                <AiChip key={i}>{f.title}</AiChip>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not enough trading data yet. Log trades to receive your daily AI insight.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <PoweredBy />
          <span className="text-[11px] text-muted-foreground">
            Confidence: <span className="num font-semibold text-foreground">{confidence}%</span> ·{" "}
            {sufficiency.sampleSize} trades analysed
          </span>
          <Button
            size="sm"
            variant="outline"
            className="no-print"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !trades.length}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Refresh insight
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <RadialGauge value={score} size={172} label="Overall AI Score" sublabel="out of 100" />
      </div>
    </section>
  );
}
