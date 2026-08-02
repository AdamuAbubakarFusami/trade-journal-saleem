import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  BarChart4,
  BrainCircuit,
  Dices,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Network,
  NotebookPen,
  Percent,
  Sigma,
  Sparkles,
  Settings,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { SaleemAiChat } from "@/components/saleem-ai-chat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/journal", label: "Journal", icon: NotebookPen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/coach", label: "AI Coach", icon: Sparkles },
  { to: "/psychology", label: "Psychology", icon: BrainCircuit },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const INSTITUTIONAL = [
  { to: "/quant-stats", label: "Quant Statistics", icon: Sigma },
  { to: "/monte-carlo", label: "Monte Carlo", icon: Dices },
  { to: "/probability", label: "Probability", icon: Percent },
  { to: "/equity", label: "Equity", icon: TrendingUp },
  { to: "/drawdown", label: "Drawdown", icon: TrendingDown },
  { to: "/distribution", label: "Trade Distribution", icon: BarChart4 },
  { to: "/correlations", label: "Correlations", icon: Network },
] as const;


export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
      <p className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        Institutional Analytics
      </p>
      {INSTITUTIONAL.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );


  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Brand />
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3 w-3" /> Powered by Saleem AI
        </p>
        <div className="mt-6 flex-1 overflow-y-auto">{nav}</div>
        <Button variant="ghost" className="justify-start gap-3" onClick={signOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">{nav}</div>
            <Button variant="ghost" className="justify-start gap-3" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-border bg-background/85 px-4 py-4 backdrop-blur md:px-8">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold md:text-xl">{title}</h1>
            {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      <SaleemAiChat />
    </div>
  );
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <LineChart className="h-4 w-4" />
      </span>
      <span className="font-display text-base font-semibold tracking-tight">SaleemJournal</span>
    </Link>
  );
}
