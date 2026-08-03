import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  AiInterpretation,
  InstitutionalPage,
  InsufficientData,
  Panel,
  RatingBadge,
} from "@/components/institutional";
import { useTrades } from "@/hooks/use-trades";
import { packContext } from "@/lib/analysis-context";
import { MIN_TRADES, tradeReplay } from "@/lib/intelligence";
import { money } from "@/lib/trades";

export const Route = createFileRoute("/_authenticated/trade-replay")({
  head: () => ({
    meta: [
      { title: "AI Trade Replay — SaleemJournal" },
      {
        name: "description",
        content:
          "Replay any trade step by step: before entry, entry, management, exit, mistakes, alternative decisions and historical comparison.",
      },
      { property: "og:title", content: "AI Trade Replay — SaleemJournal" },
      { property: "og:description", content: "A forensic timeline of every decision in a trade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TradeReplayPage,
});

function TradeReplayPage() {
  const { data: trades = [] } = useTrades();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => trades.find((t) => t.id === selectedId) ?? trades[0] ?? null,
    [trades, selectedId],
  );
  const steps = useMemo(
    () => (selected ? tradeReplay(selected, trades) : []),
    [selected, trades],
  );
  const context = useMemo(
    () => packContext({ page: "Trade replay", trade: selected, steps }),
    [selected, steps],
  );

  if (!trades.length || !selected) {
    return (
      <InstitutionalPage
        title="AI Trade Replay"
        description="Forensic timeline of a single trade"
        slug="trade-replay"
        csvRows={() => [["Not enough trading data yet."]]}
        pdfSections={() => [{ heading: "Trade replay", body: "Not enough trading data yet." }]}
      >
        <InsufficientData needed={MIN_TRADES} have={trades.length} />
      </InstitutionalPage>
    );
  }

  return (
    <InstitutionalPage
      title="AI Trade Replay"
      description={`${selected.asset} ${selected.direction} · ${selected.opened_at.slice(0, 10)} · ${money(Number(selected.profit_loss))}`}
      slug="trade-replay"
      csvRows={() => [["Phase", "Title", "Detail"], ...steps.map((s) => [s.phase, s.title, s.detail])]}
      pdfSections={() => steps.map((s) => ({ heading: `${s.phase} — ${s.title}`, body: s.detail }))}
    >
      <Panel title="Choose a trade" description="Replay is reconstructed from what you logged on that trade.">
        <select
          className="w-full max-w-xl rounded-lg border border-border bg-card px-3 py-2 text-sm"
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Select trade to replay"
        >
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.opened_at.slice(0, 10)} · {t.asset} {t.direction} · {money(Number(t.profit_loss))}
            </option>
          ))}
        </select>
      </Panel>

      <Panel title="Replay timeline" description="Seven phases reconstructed from your journal entry.">
        <ol className="relative space-y-4 border-l border-border/70 pl-6">
          {steps.map((s) => (
            <li key={s.phase} className="relative">
              <span className="absolute -left-[31px] top-2 h-3 w-3 rounded-full bg-primary" />
              <div className="ai-surface rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {s.phase}
                  </p>
                  <RatingBadge rating={s.tone} label={s.tone === "neutral" ? "Reference" : s.tone} />
                </div>
                <p className="mt-1 font-display text-sm font-semibold">{s.title}</p>
                {s.detail ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <AiInterpretation kind="discipline" context={context} title="Saleem AI replay commentary" />
    </InstitutionalPage>
  );
}
