import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { TradeDialog } from "@/components/trade-dialog";
import { TradeAnalysisDialog } from "@/components/trade-analysis-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTrades } from "@/hooks/use-trades";
import { MARKETS, money, toCsv, type Trade } from "@/lib/trades";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Journal — SaleemJournal" },
      { name: "description", content: "Every trade you have logged, searchable and editable." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Journal,
});

function Journal() {
  const { data: trades, isLoading } = useTrades();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("all");
  const [result, setResult] = useState("all");
  const [editing, setEditing] = useState<Trade | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<Trade | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (trades ?? []).filter((t) => {
      if (market !== "all" && t.market !== market) return false;
      const pnl = Number(t.profit_loss);
      if (result === "win" && pnl <= 0) return false;
      if (result === "loss" && pnl >= 0) return false;
      if (!q) return true;
      return [t.asset, t.strategy, t.setup_type, t.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [trades, query, market, result]);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      toast.success("Trade deleted");
    },
    onError: () => toast.error("Could not delete trade"),
  });

  function exportCsv() {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saleemjournal-trades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Journal"
      description="Search, review and refine every trade you have taken"
      actions={
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={exportCsv}
            disabled={!filtered.length}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Log trade
          </Button>
        </div>
      }

    >
      <TradeDialog open={dialogOpen} onOpenChange={setDialogOpen} trade={editing} />
      <TradeAnalysisDialog
        trade={analyzing}
        trades={trades ?? []}
        open={!!analyzing}
        onOpenChange={(v) => !v && setAnalyzing(null)}
      />

      <div className="surface-card mb-4 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search asset, strategy or notes"
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={market} onValueChange={setMarket}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All markets</SelectItem>
            {MARKETS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={setResult}>
          <SelectTrigger className="sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All results</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-card p-10 text-center text-sm text-muted-foreground sm:p-14">
          No trades match these filters.
        </div>
      ) : (
        <>
          {/* Mobile: one readable card per trade instead of a squeezed table. */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((t) => {
              const pnl = Number(t.profit_loss);
              return (
                <li key={t.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.asset}</p>
                      <p className="num text-xs text-muted-foreground">
                        {new Date(t.opened_at).toLocaleDateString()}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "num shrink-0 text-right font-semibold",
                        pnl >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {money(pnl)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline" className="capitalize">
                      {t.direction}
                    </Badge>
                    <Badge variant="outline">
                      {t.rr_ratio ? `${Number(t.rr_ratio).toFixed(2)}R` : "— R"}
                    </Badge>
                    {t.strategy ? <Badge variant="outline">{t.strategy}</Badge> : null}
                    {t.emotional_state ? (
                      <Badge variant="outline" className="capitalize">
                        {t.emotional_state}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 flex-1 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                      onClick={() => setAnalyzing(t)}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" /> Analyze with AI
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11 shrink-0"
                      aria-label={`Edit ${t.asset} trade`}
                      onClick={() => {
                        setEditing(t);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11 shrink-0"
                      aria-label={`Delete ${t.asset} trade`}
                      onClick={() => setDeleteId(t.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="surface-card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-sm">

            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3">Strategy</th>
                <th className="px-4 py-3">RR</th>
                <th className="px-4 py-3">Emotion</th>
                <th className="px-4 py-3 text-right">P/L</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const pnl = Number(t.profit_loss);
                return (
                  <tr key={t.id} className="transition-colors hover:bg-muted/40">
                    <td className="num px-4 py-3 text-muted-foreground">
                      {new Date(t.opened_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{t.asset}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize">
                        {t.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.strategy || "—"}</td>
                    <td className="num px-4 py-3 text-muted-foreground">
                      {t.rr_ratio ? `${Number(t.rr_ratio).toFixed(2)}R` : "—"}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {t.emotional_state || "—"}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-3 text-right font-medium",
                        pnl >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {money(pnl)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                          aria-label="Analyze trade with AI"
                          onClick={() => setAnalyzing(t)}
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          Analyze with AI
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit trade"
                          onClick={() => {
                            setEditing(t);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete trade"
                          onClick={() => setDeleteId(t.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}


      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the trade and its psychology notes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) remove.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
