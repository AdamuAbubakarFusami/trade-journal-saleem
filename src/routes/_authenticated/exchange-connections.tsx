import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useConnectExchange,
  useDisconnectExchange,
  useExchangeConnections,
  useSyncExchange,
  useSyncRuns,
  useUpdateExchangeSettings,
} from "@/hooks/use-exchanges";
import { EXCHANGE_LIST, EXCHANGE_META, scopeLabel, type ExchangeId, type ExchangeMeta } from "@/lib/exchange";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/exchange-connections")({
  component: ExchangeConnectionsPage,
  head: () => ({
    meta: [
      { title: "Exchange Connections — SaleemJournal" },
      {
        name: "description",
        content:
          "Securely connect Binance, Bybit, OKX, Bitget and MEXC with read-only API keys and auto-sync completed trades into your journal.",
      },
      { property: "og:title", content: "Exchange Connections — SaleemJournal" },
      {
        property: "og:description",
        content: "Read-only exchange API sync with duplicate protection and full sync history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "connected" || status === "operational" || status === "completed"
      ? "bg-emerald-400"
      : status === "partial"
        ? "bg-amber-400"
        : status === "failed" || status === "error"
          ? "bg-rose-400"
          : "bg-muted-foreground/50";
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone)} />;
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="ai-surface rounded-2xl border border-border/60 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ExchangeConnectionsPage() {
  const connections = useExchangeConnections();
  const runs = useSyncRuns();
  const connect = useConnectExchange();
  const disconnect = useDisconnectExchange();
  const sync = useSyncExchange();
  const updateSettings = useUpdateExchangeSettings();

  const [dialogFor, setDialogFor] = useState<ExchangeMeta | null>(null);
  const [form, setForm] = useState({ apiKey: "", apiSecret: "", passphrase: "", label: "" });
  const [scopes, setScopes] = useState<string[]>(["spot"]);
  const [autoSync, setAutoSync] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  const byExchange = useMemo(() => {
    const map = new Map<string, NonNullable<typeof connections.data>[number]>();
    for (const c of connections.data ?? []) map.set(c.exchange, c);
    return map;
  }, [connections.data]);

  const stats = useMemo(() => {
    const list = connections.data ?? [];
    const runList = runs.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const todayImports = runList
      .filter((r) => r.created_at.slice(0, 10) === today)
      .reduce((a, r) => a + r.imported_count, 0);
    const lastSync = list
      .map((c) => c.last_sync_at)
      .filter(Boolean)
      .sort()
      .pop();
    const ok = runList.filter((r) => r.status === "completed").length;
    return {
      connected: list.filter((c) => c.status === "connected").length,
      lastSync: fmtDate(lastSync ?? null),
      todayImports,
      apiStatus: list.some((c) => c.api_status === "error")
        ? "Degraded"
        : list.length
          ? "Operational"
          : "—",
      successRate: runList.length ? `${Math.round((ok / runList.length) * 100)}%` : "—",
    };
  }, [connections.data, runs.data]);

  function openDialog(meta: ExchangeMeta) {
    setDialogFor(meta);
    setForm({ apiKey: "", apiSecret: "", passphrase: "", label: "" });
    setScopes([meta.scopes[0] ?? "spot"]);
    setAutoSync(false);
  }

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function submit() {
    if (!dialogFor) return;
    if (!form.apiKey.trim() || !form.apiSecret.trim()) {
      toast.error("API key and secret are required");
      return;
    }
    if (dialogFor.passphrase && !form.passphrase.trim()) {
      toast.error(`${dialogFor.label} requires a passphrase`);
      return;
    }
    if (!scopes.length) {
      toast.error("Select at least one market to sync");
      return;
    }
    try {
      const res = await connect.mutateAsync({
        exchange: dialogFor.id,
        label: form.label,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        passphrase: form.passphrase || null,
        scopes,
        autoSync,
      });
      if (!res.ok) {
        toast.error(`${dialogFor.label} rejected the key: ${res.message}`);
        return;
      }
      toast.success(`${dialogFor.label} connected — read-only access verified`);
      setDialogFor(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function runSyncNow(id: string, label: string) {
    setSyncing(id);
    try {
      const res = await sync.mutateAsync(id);
      const summary = `${res.imported} imported · ${res.duplicates} duplicates · ${res.skipped} skipped · ${res.errors} errors`;
      if (res.status === "failed") toast.error(`${label} sync failed — ${summary}`);
      else if (res.status === "partial") toast.warning(`${label} synced with warnings — ${summary}`);
      else toast.success(`${label} synced — ${summary}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(null);
    }
  }

  return (
    <AppShell
      title="Exchange Connections"
      description="Read-only API sync for completed trades — no order placement, no withdrawals."
    >
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {connections.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
          ) : (
            <>
              <KpiTile icon={Plug} label="Connected" value={String(stats.connected)} hint="Active exchanges" />
              <KpiTile icon={Clock} label="Last sync" value={stats.lastSync} />
              <KpiTile icon={Activity} label="Today's imports" value={String(stats.todayImports)} />
              <KpiTile icon={ShieldCheck} label="API status" value={stats.apiStatus} />
              <KpiTile icon={CheckCircle2} label="Success rate" value={stats.successRate} hint="Across all syncs" />
            </>
          )}
        </div>

        <div className="ai-surface flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <p className="text-muted-foreground">
            SaleemJournal only reads trade history. It can never place or cancel orders, transfer or
            withdraw funds, or modify balances. Always create <strong>read-only</strong> API keys and
            leave withdrawals disabled.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXCHANGE_LIST.map((meta) => {
            const conn = byExchange.get(meta.id);
            const busy = syncing === conn?.id;
            return (
              <div key={meta.id} className="ai-surface rounded-2xl border border-border/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link2 className={cn("h-4 w-4", meta.accent)} />
                      <h2 className="text-base font-semibold">{meta.label}</h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{meta.hint}</p>
                  </div>
                  <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
                    <StatusDot status={conn?.status ?? "disconnected"} />
                    {conn?.status ?? "disconnected"}
                  </Badge>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Last sync</dt>
                    <dd className="font-medium">{fmtDate(conn?.last_sync_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Imported trades</dt>
                    <dd className="font-medium">{conn?.imported_trades ?? 0}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Markets</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {(conn?.scopes ?? meta.scopes).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">
                          {scopeLabel(s)}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                </dl>

                {conn ? (
                  <div className="mt-5 space-y-3">
                    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                      <span className="text-sm">Auto sync</span>
                      <Switch
                        checked={conn.auto_sync}
                        onCheckedChange={async (v) => {
                          try {
                            await connectAutoSync(conn.id, v);
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => runSyncNow(conn.id, meta.label)}
                        disabled={busy}
                        className="gap-2"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Sync now
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openDialog(meta)}>
                        Update keys
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-2 text-destructive"
                        onClick={async () => {
                          await disconnect.mutateAsync(conn.id);
                          toast.success(`${meta.label} disconnected`);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-5 w-full gap-2" onClick={() => openDialog(meta)}>
                    <Plug className="h-4 w-4" /> Connect
                  </Button>
                )}
              </div>
            );
          })}
        </section>

        <section className="ai-surface rounded-2xl border border-border/60 p-5">
          <h2 className="text-base font-semibold">Sync history</h2>
          <p className="text-xs text-muted-foreground">Every sync run with counts, duration and errors.</p>
          <div className="mt-4 overflow-x-auto">
            {runs.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : runs.isError ? (
              <p className="text-sm text-destructive">Could not load sync history.</p>
            ) : !(runs.data ?? []).length ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No syncs yet. Connect an exchange to get started.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead className="text-right">Imported</TableHead>
                    <TableHead className="text-right">Duplicates</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runs.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="capitalize">
                        {EXCHANGE_META[r.exchange as ExchangeId]?.label ?? r.exchange}
                      </TableCell>
                      <TableCell className="text-right">{r.imported_count}</TableCell>
                      <TableCell className="text-right">{r.duplicate_count}</TableCell>
                      <TableCell className="text-right">{r.skipped_count}</TableCell>
                      <TableCell className="text-right">{r.error_count}</TableCell>
                      <TableCell className="text-right">{(r.duration_ms / 1000).toFixed(1)}s</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs capitalize">
                          {r.status === "failed" ? (
                            <XCircle className="h-3.5 w-3.5 text-rose-400" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          {r.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!dialogFor} onOpenChange={(v) => !v && setDialogFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect {dialogFor?.label}</DialogTitle>
            <DialogDescription>
              Credentials are encrypted before storage and are never sent back to the browser. Use a
              read-only key with withdrawals disabled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Main account"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiSecret">Secret key</Label>
              <Input
                id="apiSecret"
                type="password"
                autoComplete="new-password"
                value={form.apiSecret}
                onChange={(e) => setForm((f) => ({ ...f, apiSecret: e.target.value }))}
              />
            </div>
            {dialogFor?.passphrase && (
              <div className="space-y-2">
                <Label htmlFor="passphrase">Passphrase</Label>
                <Input
                  id="passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={form.passphrase}
                  onChange={(e) => setForm((f) => ({ ...f, passphrase: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Markets to sync</Label>
              <div className="flex flex-wrap gap-2">
                {(dialogFor?.scopes ?? []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleScope(s)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      scopes.includes(s)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {scopeLabel(s)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <span className="text-sm">Enable auto sync</span>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogFor(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={connect.isPending} className="gap-2">
              {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Verify & connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );

  async function connectAutoSync(id: string, value: boolean) {
    await updateSettings.mutateAsync({ connectionId: id, autoSync: value });
    toast.success(value ? "Auto sync enabled" : "Auto sync disabled");
  }
}
