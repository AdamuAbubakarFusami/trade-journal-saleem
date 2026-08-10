import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  LineChart,
  NotebookPen,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SaleemJournal — AI-Powered Trading Journal for Serious Traders" },
      {
        name: "description",
        content:
          "Log trades, track psychology and uncover your real edge across Forex, Crypto, Stocks, Options and DEX. No signals — just data and discipline.",
      },
      {
        property: "og:title",
        content: "SaleemJournal — AI-Powered Trading Journal",
      },
      {
        property: "og:description",
        content:
          "Log trades, track psychology and uncover your real edge across Forex, Crypto, Stocks, Options and DEX.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: NotebookPen,
    title: "Journal every detail",
    body: "Entry, exit, stop, size, risk %, RR, session, timeframe, setup, confidence and screenshots — one structured record per trade.",
  },
  {
    icon: BarChart3,
    title: "Analytics that answer questions",
    body: "Equity curve, win rate, strategy and session breakdowns, profit distribution and risk analysis, updated as you log.",
  },
  {
    icon: BrainCircuit,
    title: "Psychology tracking",
    body: "Score fear, greed, patience and discipline before and after each trade, then watch the emotional trend over time.",
  },
  {
    icon: CalendarDays,
    title: "Trading calendar",
    body: "A month-at-a-glance heatmap of green and red days so streaks and tilt periods are impossible to miss.",
  },
];

function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="safe-x mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <LineChart className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-semibold">SaleemJournal</span>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">Start journaling</Link>
          </Button>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border">
        <div className="grid-backdrop pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:py-24 md:px-8 md:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Built for Forex, Crypto, Stocks, Options & DEX
          </span>
          <h1 className="mt-6 text-3xl font-semibold leading-[1.08] sm:text-4xl md:text-6xl">
            Your edge lives in the
            <br />
            <span className="text-gradient">trades you review</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            SaleemJournal turns your trade history into performance insight — statistics,
            psychology patterns and repeated mistakes, all in one clean workspace.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/auth">Create your free journal</Link>
            </Button>
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            No buy or sell signals. Ever.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20 md:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURES.map((f) => (
            <article key={f.title} className="surface-card p-5 sm:p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <span>© {new Date().getFullYear()} SaleemJournal</span>
          <span>Journaling and analytics only — not financial advice.</span>
        </div>
      </footer>
    </div>
  );
}
