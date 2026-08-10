import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { AiBadge, PoweredBy } from "@/components/ai-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Progress } from "@/components/ui/progress";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useAddWallet,
  useImportSwaps,
  useRemoveWallet,
  useScanWallet,
  useSkipSwaps,
  useUpdateWallet,
  useWalletSwaps,
  useWalletSyncRuns,
  useWallets,
} from "@/hooks/use-wallets";
import {
  CHAIN_LIST,
  CHAIN_META,
  PROVIDER_LABEL,
  isValidAddress,
  shortAddress,
  type ChainId,
  type WalletProvider,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/wallet-tracking")({
  component: WalletTrackingPage,
  head: () => ({
    meta: [
      { title: "Wallet Tracking — SaleemJournal" },
      {
        name: "description",
        content:
          "Track Solana, Ethereum, Base, Arbitrum and BNB Chain wallets read-only, discover DEX swaps and import them into your trading journal.",
      },
      { property: "og:title", content: "Wallet Tracking — SaleemJournal" },
      {
        property: "og:description",
        content: "Read-only Web3 wallet tracking with DEX swap discovery and journal import.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtNum = (v: number | null | undefined, digits = 4) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });

function StatusDot({ status }: { status: string }) {
  const tone =
    status === "connected" || status === "completed"
      ? "bg-emerald-400"
      : status === "partial"
        ? "bg-amber-400"
        : status === "failed"
          ? "bg-destructive"
          : "bg-muted-foreground";
  return <span className={cn("inline-block h-2 w-2 rounded-full", tone)} />;
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="ai-surface rounded-xl border border-border/60 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function WalletTrackingPage() {
  const wallets = useWallets();
  const swaps = useWalletSwaps();
  const runs = useWalletSyncRuns();

  const addWallet = useAddWallet();
  const removeWallet = useRemoveWallet();
  const updateWallet = useUpdateWallet();
  const scanWallet = useScanWallet();
  const importSwaps = useImportSwaps();
  const skipSwaps = useSkipSwaps();

  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<ChainId>("solana");
  const [provider, setProvider] = useState<WalletProvider>("manual");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [scanning, setScanning] = useState<string | null>(null);

  const rows = wallets.data ?? [];
  const allSwaps = swaps.data ?? [];
  const pending = useMemo(() => allSwaps.filter((s) => s.status === "pending"), [allSwaps]);
  const importedCount = allSwaps.filter((s) => s.status === "imported").length;

  const lastSync = rows
    .map((w) => w.last_sync_at)
    .filter(Boolean)
    .sort()
    .pop();

  const runList = runs.data ?? [];
  const successRate = runList.length
    ? (runList.filter((r) => r.status === "completed").length / runList.length) * 100
    : null;

  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !rows.length) return;
    autoRan.current = true;
    const stale = rows.filter(
      (w) =>
        w.auto_sync &&
        (!w.last_sync_at || Date.now() - new Date(w.last_sync_at).getTime() > 6 * 60 * 60 * 1000),
    );
    for (const w of stale) scanWallet.mutate(w.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  async function connectBrowserWallet(target: WalletProvider) {
    try {
      if (target === "phantom") {
        const sol = (
          window as unknown as {
            solana?: {
              isPhantom?: boolean;
              connect: () => Promise<{ publicKey: { toString(): string } }>;
            };
          }
        ).solana;
        if (!sol?.isPhantom) throw new Error("Phantom was not detected in this browser.");
        const res = await sol.connect();
        setChain("solana");
        setProvider("phantom");
        setAddress(res.publicKey.toString());
        toast.success("Phantom connected read-only");
        return;
      }
      if (target === "metamask") {
        const eth = (
          window as unknown as {
            ethereum?: { request: (a: { method: string }) => Promise<string[]> };
          }
        ).ethereum;
        if (!eth) throw new Error("MetaMask was not detected in this browser.");
        const accounts = await eth.request({ method: "eth_requestAccounts" });
        if (!accounts?.length) throw new Error("No account was shared.");
        setChain((c) => (CHAIN_META[c].family === "evm" ? c : "ethereum"));
        setProvider("metamask");
        setAddress(accounts[0]!);
        toast.success("MetaMask connected read-only");
        return;
      }
      setProvider("walletconnect");
      toast.info("Open your WalletConnect app, copy the wallet address and paste it below.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submit() {
    if (!isValidAddress(chain, address)) {
      toast.error(`Enter a valid ${CHAIN_META[chain].label} address.`);
      return;
    }
    const res = await addWallet.mutateAsync({
      chain,
      address: address.trim(),
      label,
      provider,
      autoSync,
    });
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
    setOpen(false);
    setAddress("");
    setLabel("");
    void handleScan(res.id);
  }

  async function handleScan(walletId: string) {
    setScanning(walletId);
    try {
      const r = await scanWallet.mutateAsync(walletId);
      if (r.status === "failed") toast.error(r.log.at(-1) ?? "Scan failed");
      else toast.success(`${r.discovered} new swaps found · ${r.duplicates} duplicates skipped`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(null);
    }
  }

  async function doImport(ids: string[]) {
    if (!ids.length) return;
    const r = await importSwaps.mutateAsync(ids);
    setSelected({});
    toast.success(
      `${r.imported} trades added to your journal. Open Journal to add strategy, psychology and notes.`,
    );
  }

  return (
    <AppShell
      title="Wallet Tracking"
      description="Read-only Web3 wallet tracking — swaps only, never private keys."
      actions={
        <div className="flex items-center gap-2">
          <AiBadge label="Web3" />
          <Button onClick={() => setOpen(true)}>
            <Wallet className="mr-2 h-4 w-4" /> Add wallet
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Kpi icon={Wallet} label="Connected wallets" value={String(rows.length)} />
          <Kpi icon={Activity} label="Wallet trades" value={String(allSwaps.length)} />
          <Kpi icon={CheckCircle2} label="Imported" value={String(importedCount)} />
          <Kpi icon={RefreshCw} label="Pending imports" value={String(pending.length)} />
          <Kpi icon={Clock} label="Last sync" value={lastSync ? fmtDate(lastSync) : "—"} />
          <Kpi
            icon={ShieldCheck}
            label="Success rate"
            value={successRate == null ? "—" : `${successRate.toFixed(0)}%`}
            hint={`${runList.length} scans`}
          />
        </div>

        <div className="ai-surface flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          SaleemJournal never asks for private keys or seed phrases. Wallets are tracked read-only,
          and transfers, NFTs, liquidity, staking and bridging are ignored — only trading swaps are
          discovered.
          <PoweredBy className="ml-auto" />
        </div>

        {wallets.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="ai-surface rounded-xl border border-dashed border-border/60 p-10 text-center">
            <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No wallets tracked yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect Phantom or MetaMask, or paste any wallet address to start discovering DEX
              swaps.
            </p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              Add your first wallet
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((w) => {
              const meta = CHAIN_META[w.chain as ChainId] ?? CHAIN_META.ethereum;
              const walletPending = pending.filter((s) => s.wallet_id === w.id).length;
              const busy = scanning === w.id;
              return (
                <div
                  key={w.id}
                  className="ai-surface flex flex-col gap-3 rounded-xl border border-border/60 p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold", meta.accent)}>{meta.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {w.label || PROVIDER_LABEL[(w.provider as WalletProvider) ?? "manual"]}
                      </p>
                      <p className="mt-1 font-mono text-xs">{shortAddress(w.address)}</p>
                    </div>
                    <Badge variant="outline" className="gap-1.5">
                      <StatusDot status={w.last_sync_status ?? w.status} />{" "}
                      {w.last_sync_status ?? w.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-border/50 py-2">
                      <p className="text-muted-foreground">Balance</p>
                      <p className="font-semibold">
                        {w.native_balance == null
                          ? "—"
                          : `${fmtNum(w.native_balance, 4)} ${w.native_symbol ?? meta.native}`}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 py-2">
                      <p className="text-muted-foreground">Discovered</p>
                      <p className="font-semibold">{w.discovered_trades}</p>
                    </div>
                    <div className="rounded-lg border border-border/50 py-2">
                      <p className="text-muted-foreground">Imported</p>
                      <p className="font-semibold">{w.imported_trades}</p>
                    </div>
                  </div>

                  {busy && <Progress value={66} className="h-1.5" />}

                  <p className="text-xs text-muted-foreground">
                    Last sync {fmtDate(w.last_sync_at)} · {walletPending} pending
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={() => handleScan(w.id)} disabled={busy}>
                      {busy ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      )}
                      Sync now
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={w.auto_sync}
                        onCheckedChange={(v) =>
                          updateWallet.mutate({ walletId: w.id, autoSync: v })
                        }
                      />
                      Auto sync
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      aria-label="Remove wallet"
                      onClick={() => removeWallet.mutate(w.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Tabs defaultValue="pending">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
            <TabsTrigger value="pending">Discovered swaps ({pending.length})</TabsTrigger>
            <TabsTrigger value="all">All activity</TabsTrigger>
            <TabsTrigger value="history">Sync history</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <div className="ai-surface rounded-xl border border-border/60">
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
                <p className="text-sm font-medium">Review before importing</p>
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedIds.length || skipSwaps.isPending}
                    onClick={async () => {
                      await skipSwaps.mutateAsync(selectedIds);
                      setSelected({});
                      toast.success("Selected swaps skipped");
                    }}
                  >
                    Skip selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedIds.length || importSwaps.isPending}
                    onClick={() => doImport(selectedIds)}
                  >
                    Import selected
                  </Button>
                  <Button
                    size="sm"
                    disabled={!pending.length || importSwaps.isPending}
                    onClick={() => doImport(pending.map((s) => s.id))}
                  >
                    {importSwaps.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Import all
                  </Button>
                </div>
              </div>

              {swaps.isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : pending.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Not enough trading data yet. Sync a wallet to discover DEX swaps.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Time</TableHead>
                        <TableHead>Chain</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead>Tx</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map((s) => {
                        const meta = CHAIN_META[s.chain as ChainId] ?? CHAIN_META.ethereum;
                        return (
                          <TableRow key={s.id}>
                            <TableCell>
                              <Checkbox
                                checked={!!selected[s.id]}
                                onCheckedChange={(v) =>
                                  setSelected((p) => ({ ...p, [s.id]: Boolean(v) }))
                                }
                                aria-label="Select swap"
                              />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {fmtDate(s.block_time)}
                            </TableCell>
                            <TableCell className={cn("text-xs", meta.accent)}>
                              {meta.label}
                            </TableCell>
                            <TableCell className="font-medium">{s.asset}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {s.direction === "long" ? "Buy" : "Sell"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {fmtNum(s.direction === "long" ? s.amount_out : s.amount_in)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {fmtNum(s.price, 6)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {fmtNum(s.value_usd, 2)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {fmtNum(s.fee_usd, 6)}
                            </TableCell>
                            <TableCell>
                              <a
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                href={meta.explorerTx(s.tx_hash)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {s.tx_hash.slice(0, 6)}… <ExternalLink className="h-3 w-3" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="all" className="mt-4">
            <div className="ai-surface overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Asset</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allSwaps.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Not enough trading data yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    allSwaps.map((s) => {
                      const meta = CHAIN_META[s.chain as ChainId] ?? CHAIN_META.ethereum;
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {fmtDate(s.block_time)}
                          </TableCell>
                          <TableCell className={cn("text-xs", meta.accent)}>{meta.label}</TableCell>
                          <TableCell className="font-medium">{s.asset}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.token_in ?? "?"} → {s.token_out ?? "?"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1.5 text-[10px] uppercase">
                              <StatusDot
                                status={s.status === "imported" ? "completed" : s.status}
                              />
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <a
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              href={meta.explorerTx(s.tx_hash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {s.tx_hash.slice(0, 6)}… <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="ai-surface overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Chain</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Discovered</TableHead>
                    <TableHead className="text-right">Duplicates</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runList.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No syncs yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    runList.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {fmtDate(r.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(CHAIN_META[r.chain as ChainId] ?? CHAIN_META.ethereum).label}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {shortAddress(r.address)}
                        </TableCell>
                        <TableCell className="text-right text-xs">{r.discovered_count}</TableCell>
                        <TableCell className="text-right text-xs">{r.duplicate_count}</TableCell>
                        <TableCell className="text-right text-xs">{r.error_count}</TableCell>
                        <TableCell className="text-right text-xs">
                          {(r.duration_ms / 1000).toFixed(1)}s
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1.5 text-[10px] uppercase">
                            <StatusDot status={r.status} /> {r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Track a wallet</DialogTitle>
            <DialogDescription>
              Read-only. We never request private keys or seed phrases.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["phantom", "metamask", "walletconnect"] as WalletProvider[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={provider === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => connectBrowserWallet(p)}
                >
                  {PROVIDER_LABEL[p]}
                </Button>
              ))}
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Chain</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHAIN_LIST.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    size="sm"
                    variant={chain === c.id ? "default" : "outline"}
                    onClick={() => setChain(c.id)}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-address">Wallet address</Label>
              <Input
                id="wallet-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={chain === "solana" ? "So1ana…" : "0x…"}
                spellCheck={false}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-label">Label (optional)</Label>
              <Input
                id="wallet-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Main degen wallet"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">Auto sync</p>
                <p className="text-xs text-muted-foreground">
                  Re-scan this wallet when you open this page.
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={addWallet.isPending}>
              {addWallet.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Track wallet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
