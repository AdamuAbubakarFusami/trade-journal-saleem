// Server-only orchestration for wallet discovery and journal import.
import { discoverWalletSwaps } from "./wallet-clients.server";
import type { ChainId } from "./wallet";
import { CHAIN_META } from "./wallet";

export type WalletSyncStats = {
  discovered: number;
  duplicates: number;
  errors: number;
  durationMs: number;
  status: string;
  log: string[];
  nativeBalance: number | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

export async function syncWallet(
  db: Db,
  params: { userId: string; walletId: string; chain: ChainId; address: string },
): Promise<WalletSyncStats> {
  const started = Date.now();
  const log: string[] = [];
  let discovered = 0;
  let duplicates = 0;
  let errorCount = 0;
  let status = "completed";
  let nativeBalance: number | null = null;

  try {
    const result = await discoverWalletSwaps(params.chain, params.address);
    nativeBalance = result.nativeBalance;
    for (const e of result.errors) log.push(`warning: ${e}`);
    errorCount += result.errors.length;

    log.push(
      `Scanned ${CHAIN_META[params.chain].label} — ${result.swaps.length} trading swaps detected.`,
    );

    const { data: existing } = await db
      .from("wallet_swaps")
      .select("tx_hash")
      .eq("wallet_id", params.walletId);
    const seen = new Set<string>(((existing ?? []) as { tx_hash: string }[]).map((r) => r.tx_hash));

    const rows = [] as Record<string, unknown>[];
    for (const s of result.swaps) {
      if (seen.has(s.txHash)) {
        duplicates += 1;
        continue;
      }
      seen.add(s.txHash);
      rows.push({
        user_id: params.userId,
        wallet_id: params.walletId,
        chain: params.chain,
        tx_hash: s.txHash,
        block_time: s.blockTime,
        kind: "swap",
        direction: s.direction,
        token_in: s.tokenIn,
        token_out: s.tokenOut,
        asset: s.asset,
        amount_in: s.amountIn,
        amount_out: s.amountOut,
        price: s.price,
        value_usd: s.valueUsd,
        fee_usd: s.feeUsd,
        status: "pending",
      });
    }

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await db.from("wallet_swaps").insert(chunk);
      if (error) {
        errorCount += chunk.length;
        log.push(`error: could not stage swaps — ${error.message}`);
      } else {
        discovered += chunk.length;
      }
    }

    if (errorCount && !discovered) status = result.swaps.length ? "failed" : "partial";
    else if (errorCount) status = "partial";
    if (!result.swaps.length && !errorCount)
      log.push("No new trading swaps found for this wallet.");
    log.push(`New swaps ${discovered}, duplicates skipped ${duplicates}.`);
  } catch (e) {
    status = "failed";
    errorCount += 1;
    log.push(`error: ${(e as Error).message}`);
  }

  const durationMs = Date.now() - started;

  await db.from("wallet_sync_runs").insert({
    user_id: params.userId,
    wallet_id: params.walletId,
    chain: params.chain,
    address: params.address,
    discovered_count: discovered,
    imported_count: 0,
    skipped_count: 0,
    duplicate_count: duplicates,
    error_count: errorCount,
    duration_ms: durationMs,
    status,
    log,
  });

  const { data: wallet } = await db
    .from("wallets")
    .select("discovered_trades")
    .eq("id", params.walletId)
    .maybeSingle();

  await db
    .from("wallets")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      discovered_trades: ((wallet?.discovered_trades as number) ?? 0) + discovered,
      ...(nativeBalance != null
        ? { native_balance: nativeBalance, native_symbol: CHAIN_META[params.chain].native }
        : {}),
    })
    .eq("id", params.walletId);

  return { discovered, duplicates, errors: errorCount, durationMs, status, log, nativeBalance };
}
