import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, ImageDown, Loader2, Sparkles } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { AiBadge, AiCard, PoweredBy } from "@/components/ai-ui";
import { DetectedList } from "@/components/analysis-blocks";
import { Button } from "@/components/ui/button";
import { runAnalyzer } from "@/lib/ai-analysis.functions";
import type { AnalyzerKind, AnalyzerReport } from "@/lib/analysis-types";
import { downloadCsv, downloadPng } from "@/lib/export-pro";
import { exportReportPdf, type ReportSection } from "@/lib/report-export";
import { NOT_ENOUGH, type Rating } from "@/lib/institutional";
import { cn } from "@/lib/utils";

export const RATING_CLASS: Record<Rating, string> = {
  excellent: "border-success/40 bg-success/10 text-success",
  good: "border-primary/40 bg-primary/10 text-primary",
  average: "border-warning/40 bg-warning/10 text-warning",
  poor: "border-destructive/40 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

export function RatingBadge({ rating, label }: { rating: Rating; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        RATING_CLASS[rating],
      )}
    >
      {label}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  rating = "neutral",
  ratingLabel,
  formula,
  plain,
  interpretation,
}: {
  label: string;
  value: string;
  rating?: Rating;
  ratingLabel?: string;
  formula?: string;
  plain?: string;
  interpretation?: string;
}) {
  return (
    <div className="ai-surface flex h-full flex-col rounded-xl border border-border/70 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {ratingLabel ? <RatingBadge rating={rating} label={ratingLabel} /> : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
      {plain ? <p className="mt-2 text-xs text-muted-foreground">{plain}</p> : null}
      {formula ? (
        <p className="mt-2 rounded-md bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {formula}
        </p>
      ) : null}
      {interpretation ? (
        <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-foreground/80">
          <span className="mr-1 font-semibold text-primary">AI read:</span>
          {interpretation}
        </p>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("ai-surface rounded-2xl border border-border/70 p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function InsufficientData({ needed = 5, have = 0 }: { needed?: number; have?: number }) {
  return (
    <div className="ai-surface rounded-2xl border border-dashed border-border p-10 text-center">
      <AiBadge label="Saleem AI" className="mx-auto" />
      <p className="mt-4 font-display text-lg font-semibold">{NOT_ENOUGH}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Institutional statistics need at least {needed} completed trades to be meaningful. You have{" "}
        {have}. Log more trades in the journal and this page will fill in automatically.
      </p>
    </div>
  );
}

/** AI interpretation block — asks Saleem AI to read the page's own computed data. */
export function AiInterpretation({
  kind,
  context,
  title = "Saleem AI interpretation",
  prompt = "Generate AI interpretation",
  disabled,
}: {
  kind: AnalyzerKind;
  context: string;
  title?: string;
  prompt?: string;
  disabled?: boolean;
}) {
  const run = useServerFn(runAnalyzer);
  const mutation = useMutation({
    mutationFn: () => run({ data: { kind, context } }) as Promise<AnalyzerReport>,
    onError: (e: Error) => toast.error(e.message || "The AI could not complete that analysis."),
  });
  const report = mutation.data;

  return (
    <AiCard
      title={title}
      glow
      icon={<Sparkles className="h-4 w-4" />}
      actions={
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={disabled || mutation.isPending}
          data-export-ignore="true"
        >
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {report ? "Regenerate" : prompt}
        </Button>
      }
    >
      {!report ? (
        <p className="text-sm text-muted-foreground">
          {disabled
            ? NOT_ENOUGH
            : "Saleem AI will read the metrics on this page and explain what they mean for your process — evidence only, no predictions."}
        </p>
      ) : report.insufficientData ? (
        <p className="text-sm text-muted-foreground">{NOT_ENOUGH}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-display text-base font-semibold">{report.headline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{report.summary}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Findings
              </p>
              <DetectedList items={report.findings} empty="No findings returned." />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommendations
              </p>
              <DetectedList items={report.recommendations} tone="good" empty="No actions returned." />
            </div>
          </div>
        </div>
      )}
    </AiCard>
  );
}

/**
 * Institutional page frame — provides the header, the PDF/CSV/PNG export bar and
 * the capture target used for the PNG export.
 */
export function InstitutionalPage({
  title,
  description,
  slug,
  csvRows,
  pdfSections,
  pdfSubtitle,
  children,
}: {
  title: string;
  description: string;
  slug: string;
  csvRows: () => (string | number | null | undefined)[][];
  pdfSections: () => ReportSection[];
  pdfSubtitle?: string;
  children: ReactNode;
}) {
  const captureRef = useRef<HTMLDivElement>(null);

  async function exportPng() {
    try {
      const ok = await downloadPng(captureRef.current, `saleemjournal-${slug}.png`);
      if (ok) toast.success("PNG exported.");
    } catch {
      toast.error("Could not capture this page as an image.");
    }
  }

  return (
    <AppShell
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2" data-export-ignore="true">
          <AiBadge label="Institutional" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              downloadCsv(`saleemjournal-${slug}.csv`, csvRows());
              toast.success("CSV exported.");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportPng}>
            <ImageDown className="mr-2 h-4 w-4" /> PNG
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const ok = exportReportPdf({
                title,
                subtitle: pdfSubtitle ?? description,
                sections: pdfSections(),
              });
              if (!ok) toast.error("Allow pop-ups to export the PDF report.");
            }}
          >
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
      }
    >
      <div ref={captureRef} className="space-y-6">
        {children}
        <PoweredBy className="pt-2" />
      </div>
    </AppShell>
  );
}
