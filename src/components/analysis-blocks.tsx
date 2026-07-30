import type { Detected, ScoreItem } from "@/lib/analysis-types";
import { cn } from "@/lib/utils";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DetectedList({
  items,
  tone = "default",
  empty = "Nothing detected.",
}: {
  items?: Detected[] | null;
  tone?: "default" | "good" | "bad";
  empty?: string;
}) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={`${item?.title}-${i}`} className="rounded-lg border border-border p-3">
          <p
            className={cn(
              "text-sm font-medium",
              tone === "good" && "text-success",
              tone === "bad" && "text-destructive",
            )}
          >
            {item?.title}
          </p>
          {item?.explanation ? (
            <p className="mt-1 text-sm text-muted-foreground">{item.explanation}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function ScoreBars({ scores }: { scores?: ScoreItem[] | null }) {
  if (!scores?.length) return <p className="text-sm text-muted-foreground">No scores returned.</p>;
  return (
    <div className="space-y-3">
      {scores.map((s, i) => {
        const value = Math.max(0, Math.min(10, Number(s?.score) || 0));
        return (
          <div key={`${s?.name}-${i}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{s?.name}</span>
              <span className="num text-muted-foreground">{value}/10</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  value >= 7 ? "bg-success" : value >= 5 ? "bg-primary" : "bg-destructive",
                )}
                style={{ width: `${value * 10}%` }}
              />
            </div>
            {s?.comment ? (
              <p className="mt-1 text-xs text-muted-foreground">{s.comment}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function GradePill({ label }: { label?: string }) {
  const good = /A\+|A\)|Excellent|Very Good/i.test(label ?? "");
  const bad = /D\)|F\)|Poor|Bad/i.test(label ?? "");
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-semibold",
        good && "border-success/40 bg-success/10 text-success",
        bad && "border-destructive/40 bg-destructive/10 text-destructive",
        !good && !bad && "border-primary/40 bg-primary/10 text-primary",
      )}
    >
      {label || "Ungraded"}
    </span>
  );
}

export function EmptyState({
  title = "Not enough trading data yet.",
  hint = "Continue journaling to unlock deeper AI insights.",
}: {
  title?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center animate-in fade-in duration-500">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full bg-primary/10" />
        <div className="absolute inset-3 rounded-full border border-primary/30" />
        <div className="absolute inset-6 rounded-full bg-primary/40" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ConfidenceCard({
  confidence,
  sampleSize,
}: {
  confidence?: { percent?: number; reason?: string; dataSufficiency?: string; sampleSize?: number } | null;
  sampleSize?: number;
}) {
  if (!confidence) return null;
  const value = Math.max(0, Math.min(100, Number(confidence.percent) || 0));
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          AI confidence
        </p>
        <span className="num text-sm font-semibold">{value}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            value >= 70 ? "bg-success" : value >= 40 ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{confidence.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Data sufficiency: {confidence.dataSufficiency ?? "—"} · Sample size:{" "}
        {confidence.sampleSize ?? sampleSize ?? 0} trades
      </p>
    </div>
  );
}

export function FlagList({ items, tone }: { items: Detected[]; tone: "good" | "bad" }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((f, i) => (
        <span
          key={`${f.title}-${i}`}
          title={f.explanation}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            tone === "good"
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {f.title}
        </span>
      ))}
    </div>
  );
}
