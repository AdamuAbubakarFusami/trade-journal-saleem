import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { AiBadge, PoweredBy } from "@/components/ai-ui";
import { Panel } from "@/components/institutional";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTrades } from "@/hooks/use-trades";
import {
  useDeleteImportBatch,
  useImportBatches,
  useSaveMapping,
  useSavedMappings,
} from "@/hooks/use-imports";
import {
  FIELDS,
  MAX_FILE_BYTES,
  MISSING,
  PLATFORMS,
  PLATFORM_LABEL,
  autoMap,
  buildStagedTrades,
  fmtValue,
  parseCsv,
  type FieldKey,
  type Mapping,
  type Platform,
  type StagedTrade,
} from "@/lib/csv-import";
import { downloadCsv } from "@/lib/export-pro";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/csv-import")({
  head: () => ({
    meta: [
      { title: "CSV Import — SaleemJournal" },
      {
        name: "description",
        content:
          "Import historical trades from Binance, Bybit, OKX, Bitget, MEXC, MT4, MT5, TradingView or any generic CSV with intelligent column mapping, validation and duplicate detection.",
      },
      { property: "og:title", content: "CSV Import — SaleemJournal" },
      {
        property: "og:description",
        content: "Bulk import broker exports straight into your trading journal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CsvImportPage,
});

type Step = "upload" | "map" | "preview" | "done";

type Summary = {
  imported: number;
  duplicates: number;
  skipped: number;
  errors: number;
  durationMs: number;
  fileName: string;
  platform: Platform;
};

const STATUS_STYLE: Record<StagedTrade["status"], string> = {
  ready: "border-success/40 bg-success/10 text-success",
  duplicate: "border-warning/40 bg-warning/10 text-warning",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
};

function CsvImportPage() {
  const queryClient = useQueryClient();
  const { data: trades = [], isLoading: tradesLoading } = useTrades();
  const { data: batches = [], isLoading: historyLoading } = useImportBatches();
  const { data: savedMappings = [] } = useSavedMappings();
  const saveMapping = useSaveMapping();
  const deleteBatch = useDeleteImportBatch();

  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [platform, setPlatform] = useState<Platform>("generic");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [emptyRows, setEmptyRows] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [staged, setStaged] = useState<StagedTrade[]>([]);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);

  const existingKeys = useMemo(
    () =>
      trades.map((t) => ({
        asset: t.asset,
        direction: t.direction,
        entry_price: t.entry_price === null ? null : Number(t.entry_price),
        exit_price: t.exit_price === null ? null : Number(t.exit_price),
        opened_at: t.opened_at,
      })),
    [trades],
  );

  useEffect(() => {
    if (step !== "preview" || !rows.length) return;
    setStaged(buildStagedTrades(rows, mapping, platform, existingKeys));
  }, [step, rows, mapping, platform, existingKeys]);

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setStaged([]);
    setEmptyRows(0);
    setMapping({});
    setProgress(0);
    setSummary(null);
  }

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("Only .csv files are supported.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File is larger than the 50MB limit.");
      return;
    }
    setParsing(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.rows.length) {
        toast.error("No data rows found in this CSV.");
        return;
      }
      const saved = savedMappings.find((m) => m.platform === platform)?.mapping;
      const auto = autoMap(parsed.headers);
      const restored: Mapping = { ...auto };
      if (saved) {
        for (const [key, col] of Object.entries(saved)) {
          if (col && parsed.headers.includes(col)) restored[key as FieldKey] = col;
        }
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setEmptyRows(parsed.emptyRows);
      setMapping(restored);
      setStep("map");
      toast.success(`${parsed.rows.length} rows parsed from ${file.name}.`);
    } catch {
      toast.error("Could not read this file.");
    } finally {
      setParsing(false);
    }
  }

  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  const counts = useMemo(() => {
    const ready = staged.filter((s) => s.status === "ready");
    return {
      ready: ready.length,
      selected: ready.filter((s) => s.include).length,
      duplicates: staged.filter((s) => s.status === "duplicate").length,
      errors: staged.filter((s) => s.status === "error").length,
    };
  }, [staged]);

  async function runImport() {
    const selected = staged.filter((s) => s.status === "ready" && s.include);
    if (!selected.length) {
      toast.error("No valid rows selected to import.");
      return;
    }
    const started = Date.now();
    setImporting(true);
    setProgress(4);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const payload = selected.map((s) => ({
        user_id: user.id,
        asset: s.values.asset as string,
        market: s.values.market,
        direction: s.values.direction as string,
        entry_price: s.values.entry_price,
        exit_price: s.values.exit_price,
        stop_loss: s.values.stop_loss,
        take_profit: s.values.take_profit,
        position_size: s.values.position_size,
        profit_loss: s.values.profit_loss ?? 0,
        rr_ratio: s.values.rr_ratio,
        strategy: s.values.strategy,
        notes: s.values.notes,
        opened_at: s.values.opened_at as string,
        closed_at: s.values.closed_at,
      }));

      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from("trades").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
        setProgress(Math.round((inserted / payload.length) * 96) + 4);
      }

      const durationMs = Date.now() - started;
      const skipped = staged.filter((s) => s.status === "ready" && !s.include).length;
      const result: Summary = {
        imported: inserted,
        duplicates: counts.duplicates,
        skipped,
        errors: counts.errors,
        durationMs,
        fileName,
        platform,
      };

      await supabase.from("import_batches").insert({
        user_id: user.id,
        platform,
        file_name: fileName,
        total_rows: staged.length,
        imported_count: inserted,
        duplicate_count: counts.duplicates,
        skipped_count: skipped,
        error_count: counts.errors,
        duration_ms: durationMs,
        status: counts.errors > 0 ? "completed_with_errors" : "completed",
        log: staged.map((s) => ({
          row: s.rowNumber,
          asset: s.values.asset,
          status: s.include || s.status !== "ready" ? s.status : "skipped",
          duplicateOf: s.duplicateOf,
          issues: s.issues.map((i) => `${i.severity}: ${i.message}`),
        })) as never,
      });

      await saveMapping.mutateAsync({ platform, mapping });
      await queryClient.invalidateQueries({ queryKey: ["trades"] });
      await queryClient.invalidateQueries({ queryKey: ["import-batches"] });

      setSummary(result);
      setStep("done");
      toast.success(`${inserted} trades imported into your journal.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
      setProgress(0);
    } finally {
      setImporting(false);
    }
  }

  function downloadLog(batchId: string) {
    const batch = batches.find((b) => b.id === batchId);
    if (!batch) return;
    const entries = Array.isArray(batch.log) ? (batch.log as Record<string, unknown>[]) : [];
    downloadCsv(`saleemjournal-import-log-${batch.id.slice(0, 8)}.csv`, [
      ["Row", "Asset", "Status", "Duplicate of", "Issues"],
      ...entries.map((e) => [
        String(e["row"] ?? ""),
        String(e["asset"] ?? MISSING),
        String(e["status"] ?? ""),
        String(e["duplicateOf"] ?? ""),
        Array.isArray(e["issues"]) ? (e["issues"] as string[]).join(" | ") : "",
      ]),
    ]);
    toast.success("Log downloaded.");
  }

  return (
    <AppShell
      title="CSV Import"
      description="Bring historical trades from your broker or exchange straight into SaleemJournal."
      actions={
        <div className="flex items-center gap-2">
          <AiBadge label="Data Automation" />
          {step !== "upload" && (
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Start over
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <Steps step={step} />

        {step === "upload" && (
          <Panel
            title="Upload a CSV export"
            description="Drag & drop or pick a file. CSV only, up to 50MB."
          >
            <div ref={uploadRef} className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors",
                  dragging
                    ? "border-primary bg-primary/10"
                    : "border-border/70 bg-muted/20 hover:border-primary/50",
                )}
              >
                {parsing ? (
                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
                ) : (
                  <Upload className="mb-3 h-8 w-8 text-primary" />
                )}
                <p className="text-sm font-medium">
                  {parsing ? "Reading your file…" : "Drop your CSV here or click to browse"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Binance · Bybit · OKX · Bitget · MEXC · MT4 · MT5 · TradingView · Generic
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="ai-surface space-y-3 rounded-xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source platform
                </p>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABEL[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Column mapping is detected automatically and remembered per platform for your next
                  import.
                </p>
                <PoweredBy />
              </div>
            </div>
          </Panel>
        )}

        {step === "map" && (
          <Panel
            title="Map your columns"
            description={`${fileName} · ${rows.length} rows · ${headers.length} columns${
              emptyRows ? ` · ${emptyRows} empty rows ignored` : ""
            }`}
            actions={
              <Button
                size="sm"
                disabled={missingRequired.length > 0}
                onClick={() => setStep("preview")}
              >
                Continue to preview
              </Button>
            }
          >
            {missingRequired.length > 0 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Required fields not mapped: {missingRequired.map((f) => f.label).join(", ")}.
                </span>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="ai-surface rounded-xl border border-border/70 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">
                      {field.label}
                      {field.required && <span className="ml-1 text-destructive">*</span>}
                    </p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {field.kind}
                    </span>
                  </div>
                  <Select
                    value={mapping[field.key] ?? "__none"}
                    onValueChange={(v) =>
                      setMapping((m) => ({
                        ...m,
                        [field.key]: v === "__none" ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Not mapped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not mapped</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 truncate text-[11px] text-muted-foreground">
                    Sample: {mapping[field.key] ? fmtValue(rows[0]?.[mapping[field.key]!]) : MISSING}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {step === "preview" && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Valid rows" value={counts.ready} tone="success" />
              <Stat label="Selected" value={counts.selected} tone="primary" />
              <Stat label="Duplicates" value={counts.duplicates} tone="warning" />
              <Stat label="Errors" value={counts.errors} tone="destructive" />
            </div>

            <Panel
              title="Preview & validate"
              description="Review every row before it becomes a journal entry. Unknown fields stay empty — nothing is invented."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setStaged((s) =>
                        s.map((r) => (r.status === "ready" ? { ...r, include: true } : r)),
                      )
                    }
                  >
                    Select all valid
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("map")}>
                    Back to mapping
                  </Button>
                  <Button size="sm" disabled={importing || !counts.selected} onClick={runImport}>
                    {importing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Import {counts.selected} trades
                  </Button>
                </div>
              }
            >
              {importing && <Progress value={progress} className="mb-4 h-2" />}
              {tradesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <div className="max-h-[520px] overflow-auto rounded-xl border border-border/70">
                  <table className="w-full min-w-[1080px] text-left text-xs">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2">Use</th>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Asset</th>
                        <th className="px-3 py-2">Market</th>
                        <th className="px-3 py-2">Direction</th>
                        <th className="px-3 py-2">Entry</th>
                        <th className="px-3 py-2">Exit</th>
                        <th className="px-3 py-2">SL</th>
                        <th className="px-3 py-2">TP</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">P/L</th>
                        <th className="px-3 py-2">RR</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staged.slice(0, 500).map((row, i) => (
                        <tr key={row.rowNumber} className="border-t border-border/50">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                              disabled={row.status !== "ready"}
                              checked={row.include}
                              onChange={(e) =>
                                setStaged((s) =>
                                  s.map((r, idx) =>
                                    idx === i ? { ...r, include: e.target.checked } : r,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                                STATUS_STYLE[row.status],
                              )}
                            >
                              {row.status === "duplicate"
                                ? `Duplicate (${row.duplicateOf})`
                                : row.status}
                            </span>
                          </td>
                          <Cell v={row.values.asset} />
                          <Cell v={row.values.market} />
                          <Cell v={row.values.direction} />
                          <Cell v={row.values.entry_price} />
                          <Cell v={row.values.exit_price} />
                          <Cell v={row.values.stop_loss} />
                          <Cell v={row.values.take_profit} />
                          <Cell v={row.values.position_size} />
                          <td
                            className={cn(
                              "px-3 py-2 font-medium",
                              (row.values.profit_loss ?? 0) > 0
                                ? "text-success"
                                : (row.values.profit_loss ?? 0) < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {fmtValue(row.values.profit_loss)}
                          </td>
                          <Cell v={row.values.rr_ratio} />
                          <Cell
                            v={row.values.opened_at ? row.values.opened_at.slice(0, 16).replace("T", " ") : null}
                          />
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.issues.length
                              ? row.issues.map((iss) => iss.message).join("; ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {staged.length > 500 && (
                    <p className="border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground">
                      Showing the first 500 of {staged.length} rows. All valid rows will still be
                      imported.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          </>
        )}

        {step === "done" && summary && (
          <Panel
            title="Import summary"
            description={`${summary.fileName} · ${PLATFORM_LABEL[summary.platform]}`}
            actions={
              <Button size="sm" onClick={reset}>
                <Upload className="mr-2 h-4 w-4" /> Import another file
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Stat label="Imported trades" value={summary.imported} tone="success" />
              <Stat label="Duplicates" value={summary.duplicates} tone="warning" />
              <Stat label="Skipped" value={summary.skipped} tone="muted" />
              <Stat label="Errors" value={summary.errors} tone="destructive" />
              <Stat
                label="Duration"
                value={`${(summary.durationMs / 1000).toFixed(1)}s`}
                tone="primary"
              />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-xs text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Journal entries were created with RR ratio, win/loss and performance statistics
                recalculated automatically across your analytics.
              </span>
            </div>
          </Panel>
        )}

        <Panel
          title="Import history"
          description="Every import is logged with counts, duration and status."
        >
          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/70 p-8 text-center">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No imports yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="bg-muted/60">
                  <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Platform</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Imported</th>
                    <th className="px-3 py-2">Duplicates</th>
                    <th className="px-3 py-2">Errors</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-t border-border/50">
                      <td className="px-3 py-2">
                        {new Date(b.created_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-3 py-2">
                        {PLATFORM_LABEL[b.platform as Platform] ?? b.platform}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                        {b.file_name}
                      </td>
                      <td className="px-3 py-2 text-success">{b.imported_count}</td>
                      <td className="px-3 py-2 text-warning">{b.duplicate_count}</td>
                      <td className="px-3 py-2 text-destructive">{b.error_count}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                            b.error_count > 0
                              ? "border-warning/40 bg-warning/10 text-warning"
                              : "border-success/40 bg-success/10 text-success",
                          )}
                        >
                          {b.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Download log"
                            onClick={() => downloadLog(b.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Re-import from this platform"
                            onClick={() => {
                              reset();
                              setPlatform((b.platform as Platform) ?? "generic");
                              uploadRef.current?.scrollIntoView({ behavior: "smooth" });
                              toast.info(
                                `Ready to re-import — select ${b.file_name} again to run it through the same mapping.`,
                              );
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete record"
                            disabled={deleteBatch.isPending}
                            onClick={() => {
                              deleteBatch.mutate(b.id, {
                                onSuccess: () => toast.success("Import record deleted."),
                                onError: () => toast.error("Could not delete this record."),
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Cell({ v }: { v: string | number | null }) {
  const missing = v === null || v === undefined || v === "";
  return (
    <td className={cn("px-3 py-2", missing && "text-[11px] italic text-muted-foreground")}>
      {missing ? MISSING : String(v)}
    </td>
  );
}

const TONE: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  primary: "text-primary",
  muted: "text-muted-foreground",
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="ai-surface rounded-xl border border-border/70 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 font-display text-2xl font-semibold", TONE[tone])}>{value}</p>
    </div>
  );
}

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map columns" },
  { key: "preview", label: "Preview & validate" },
  { key: "done", label: "Summary" },
];

function Steps({ step }: { step: Step }) {
  const index = STEP_LABELS.findIndex((s) => s.key === step);
  return (
    <div className="ai-surface flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 p-4">
      {STEP_LABELS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold",
              i < index
                ? "bg-success/20 text-success"
                : i === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < index ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              i === index ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {s.label}
          </span>
          {i < STEP_LABELS.length - 1 && <X className="hidden h-3 w-3 rotate-45 opacity-0" />}
        </div>
      ))}
    </div>
  );
}
