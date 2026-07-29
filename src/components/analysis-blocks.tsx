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
