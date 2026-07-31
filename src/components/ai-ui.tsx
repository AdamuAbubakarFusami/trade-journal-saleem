import type { ReactNode } from "react";
import { BrainCircuit, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function AiBadge({
  label = "Saleem AI",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary",
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  );
}

export function AiStatus({ active, label }: { active?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "animate-pulse bg-primary" : "bg-muted-foreground/50",
        )}
      />
      {label}
    </span>
  );
}

export function PoweredBy({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <BrainCircuit className="h-3 w-3 text-primary" />
      Powered by Saleem AI
    </span>
  );
}

export function AiChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "bad" | "neutral";
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs",
        tone === "good" && "border-success/40 bg-success/10 text-success",
        tone === "bad" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "neutral" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function AiCard({
  title,
  icon,
  actions,
  children,
  className,
  glow,
}: {
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={cn(
        "ai-surface p-5 transition-all duration-300 hover:border-primary/40",
        glow && "glow-ring",
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {icon}
            {title}
          </h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

const toneFor = (v: number) =>
  v >= 70 ? "var(--color-success)" : v >= 40 ? "var(--color-primary)" : "var(--color-destructive)";

export function RadialGauge({
  value,
  label,
  sublabel,
  size = 160,
}: {
  value: number | null;
  label?: string;
  sublabel?: string;
  size?: number;
}) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const stroke = Math.max(8, size / 14);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (v / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={toneFor(v)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="num text-2xl font-semibold" style={{ fontSize: size / 5 }}>
              {value === null ? "—" : v}
            </p>
            {sublabel ? <p className="text-[10px] text-muted-foreground">{sublabel}</p> : null}
          </div>
        </div>
      </div>
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
    </div>
  );
}

export function ScoreRing({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="ai-surface flex flex-col items-center gap-1 p-4">
      <RadialGauge value={value} size={84} />
      <p className="text-center text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export function Meter({
  label,
  value,
  max = 10,
  invert = false,
  hint,
}: {
  label: string;
  value: number | null;
  max?: number;
  invert?: boolean;
  hint?: string;
}) {
  const raw = value === null ? 0 : Math.max(0, Math.min(max, value));
  const pctValue = (raw / max) * 100;
  const health = invert ? 100 - pctValue : pctValue;
  return (
    <div className="ai-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{label}</p>
        <span className="num text-sm text-muted-foreground">
          {value === null ? "—" : `${raw.toFixed(1)}/${max}`}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            health >= 70 ? "bg-success" : health >= 40 ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${pctValue}%` }}
        />
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function AiEmptyCard({
  title = "Not enough trading data yet.",
  hint = "Log at least 20 trades to unlock advanced AI insights.",
  action,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ai-surface flex flex-col items-center gap-3 p-12 text-center animate-in fade-in duration-500">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <BrainCircuit className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}
