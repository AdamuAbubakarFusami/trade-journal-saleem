import { cn } from "@/lib/utils";
import { money } from "@/lib/trades";

export type HeatCell = { name: string; trades: number; pnl: number; winRate: number };

function intensity(pnl: number, max: number) {
  if (!max) return 0;
  return Math.min(1, Math.abs(pnl) / max);
}

/** Generic P/L heat grid used for session, strategy, emotion and monthly views. */
export function HeatGrid({ title, cells }: { title: string; cells: HeatCell[] }) {
  const max = Math.max(...cells.map((c) => Math.abs(c.pnl)), 1);
  return (
    <div className="ai-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {cells.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Not enough trading data yet.</p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {cells.map((c) => {
            const a = intensity(c.pnl, max);
            return (
              <div
                key={c.name}
                className="rounded-lg border border-border p-3 transition-transform duration-200 hover:-translate-y-0.5"
                style={{
                  background: `color-mix(in oklab, var(${
                    c.pnl >= 0 ? "--color-success" : "--color-destructive"
                  }) ${Math.round(a * 26)}%, transparent)`,
                }}
              >
                <p className="truncate text-sm font-medium capitalize">{c.name}</p>
                <p
                  className={cn(
                    "num text-sm font-semibold",
                    c.pnl >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {money(c.pnl)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.trades} trades · {c.winRate.toFixed(0)}% win
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** GitHub-style daily P/L calendar for the trailing 26 weeks. */
export function CalendarHeatmap({ days }: { days: Map<string, number> }) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 26 * 7 - today.getDay());

  const weeks: { key: string; pnl: number | undefined }[][] = [];
  for (let w = 0; w < 27; w++) {
    const week: { key: string; pnl: number | undefined }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = date.toISOString().slice(0, 10);
      week.push({ key, pnl: days.get(key) });
    }
    weeks.push(week);
  }
  const max = Math.max(...[...days.values()].map(Math.abs), 1);

  return (
    <div className="ai-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Calendar heatmap · last 6 months</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-destructive" /> Loss
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-success" /> Profit
          </span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="flex gap-1">
          {weeks.map((week, i) => (
            <div key={i} className="flex flex-col gap-1">
              {week.map((day) => (
                <span
                  key={day.key}
                  title={day.pnl === undefined ? day.key : `${day.key}: ${money(day.pnl)}`}
                  className="h-3 w-3 rounded-sm border border-border/60"
                  style={
                    day.pnl === undefined
                      ? undefined
                      : {
                          background: `color-mix(in oklab, var(${
                            day.pnl >= 0 ? "--color-success" : "--color-destructive"
                          }) ${Math.round(20 + intensity(day.pnl, max) * 70)}%, transparent)`,
                        }
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
