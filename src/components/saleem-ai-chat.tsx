import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Loader2, Send, X } from "lucide-react";

import { AiBadge, AiStatus } from "@/components/ai-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { askCoach } from "@/lib/coach.functions";
import { useTrades } from "@/hooks/use-trades";
import { computeStats, groupBy } from "@/lib/trades";

const SUGGESTIONS = [
  "Why am I losing?",
  "What is my biggest mistake?",
  "What should I improve?",
  "How is my psychology?",
  "What strategy performs best?",
];

const avg = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);

type Msg = { role: "user" | "ai"; text: string };

/** Floating Saleem AI assistant — answers strictly from aggregated journal data. */
export function SaleemAiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const { data: trades } = useTrades();
  const list = useMemo(() => trades ?? [], [trades]);
  const ask = useServerFn(askCoach);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const summary = useMemo(() => {
    const s = computeStats(list);
    const num = (n: number) => Number(n.toFixed(2));
    return {
      total: s.total,
      winRate: num(s.winRate),
      netPnl: num(s.netPnl),
      avgRr: num(s.avgRr),
      profitFactor: Number.isFinite(s.profitFactor) ? num(s.profitFactor) : 99,
      avgWin: num(s.avgWin),
      avgLoss: num(s.avgLoss),
      streak: s.streak,
      topStrategies: groupBy(list, (t) => t.strategy)
        .slice(0, 8)
        .map((g) => ({ name: g.name, pnl: num(g.pnl), winRate: num(g.winRate) })),
      emotions: groupBy(list, (t) => t.emotional_state)
        .slice(0, 8)
        .map((g) => ({ name: g.name, pnl: num(g.pnl), winRate: num(g.winRate) })),
      avgDiscipline: num(avg(list.map((t) => Number(t.discipline_level)).filter(Number.isFinite))),
      avgFear: num(avg(list.map((t) => Number(t.fear_level)).filter(Number.isFinite))),
      avgGreed: num(avg(list.map((t) => Number(t.greed_level)).filter(Number.isFinite))),
    };
  }, [list]);

  const mutation = useMutation({
    mutationFn: async (question: string) =>
      (await ask({ data: { question, summary } })) as { answer: string },
    onSuccess: (data) =>
      setMessages((m) => [...m, { role: "ai", text: data.answer ?? "No response." }]),
    onError: () =>
      setMessages((m) => [
        ...m,
        { role: "ai", text: "I couldn't reach the analysis engine. Please try again." },
      ]),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (open) inputRef.current?.focus();
  }, [messages, open, mutation.isPending]);

  function send(text: string) {
    const q = text.trim().slice(0, 500);
    if (!q || mutation.isPending) return;
    if (!list.length) {
      setMessages((m) => [
        ...m,
        { role: "user", text: q },
        {
          role: "ai",
          text: "Not enough trading data yet. Log some trades and I'll analyse them for you.",
        },
      ]);
      setInput("");
      return;
    }
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    mutation.mutate(q);
  }

  return (
    <div className="no-print fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="ai-surface flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
                <BrainCircuit className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Saleem AI</p>
                <AiStatus
                  active={mutation.isPending}
                  label={mutation.isPending ? "Thinking…" : "Online"}
                />
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close AI chat"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask me anything about your journal. I only use your logged trades — no market
                  predictions, no signals.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "text-foreground",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your journal…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                rows={1}
                maxLength={500}
                value={input}
                placeholder="Ask Saleem AI…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                className="max-h-28 min-h-10 resize-none"
              />
              <Button
                size="icon"
                aria-label="Send message"
                onClick={() => send(input)}
                disabled={mutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Saleem AI assistant"
        className="glow-ring flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform duration-200 hover:scale-105"
      >
        <BrainCircuit className="h-5 w-5" />
        <span className="hidden sm:inline">Saleem AI</span>
      </button>
      {!open && messages.length === 0 ? <AiBadge className="sr-only" /> : null}
    </div>
  );
}
