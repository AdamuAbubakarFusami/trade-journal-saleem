// Server-only orchestration for exchange credential storage and trade syncing.
import { decryptSecret, encryptSecret } from "./exchange-crypto.server";
import { buildRoundTrips, fetchFills, verifyCredentials, type ClosedTrade } from "./exchange-clients.server";
import { dedupeKey } from "./csv-import";
import type { ExchangeId, SyncScope } from "./exchange";

export type SyncStats = {
  imported: number;
  skipped: number;
  duplicates: number;
  errors: number;
  durationMs: number;
  status: string;
  log: string[];
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function storeCredentials(
  connectionId: string,
  userId: string,
  creds: { apiKey: string; apiSecret: string; passphrase?: string | null },
) {
  const db = await admin();
  const { error } = await db.from("exchange_credentials").upsert(
    {
      connection_id: connectionId,
      user_id: userId,
      enc_api_key: await encryptSecret(creds.apiKey),
      enc_api_secret: await encryptSecret(creds.apiSecret),
      enc_passphrase: creds.passphrase ? await encryptSecret(creds.passphrase) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "connection_id" },
  );
  if (error) throw new Error(error.message);
}

export async function loadCredentials(connectionId: string, userId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("exchange_credentials")
    .select("enc_api_key, enc_api_secret, enc_passphrase")
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No stored credentials for this connection");
  return {
    apiKey: await decryptSecret(data.enc_api_key),
    apiSecret: await decryptSecret(data.enc_api_secret),
    passphrase: data.enc_passphrase ? await decryptSecret(data.enc_passphrase) : null,
  };
}

export { verifyCredentials };

export async function runSync(params: {
  userId: string;
  connectionId: string;
  exchange: ExchangeId;
  scopes: SyncScope[];
}): Promise<SyncStats> {
  const started = Date.now();
  const log: string[] = [];
  const db = await admin();

  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let errorCount = 0;
  let status = "completed";

  try {
    const creds = await loadCredentials(params.connectionId, params.userId);
    const { fills, errors } = await fetchFills(params.exchange, creds, params.scopes);
    for (const e of errors) log.push(`warning: ${e}`);
    errorCount += errors.length;

    const trips: ClosedTrade[] = buildRoundTrips(fills);
    log.push(`Fetched ${fills.length} fills, matched ${trips.length} completed trades.`);

    const { data: existing, error: exErr } = await db
      .from("trades")
      .select("asset, direction, entry_price, exit_price, opened_at")
      .eq("user_id", params.userId);
    if (exErr) throw new Error(exErr.message);

    const seen = new Set((existing ?? []).map((t) => dedupeKey(t as never)));
    const rows: Record<string, unknown>[] = [];

    for (const t of trips) {
      if (!t.entry_price || !t.exit_price || !t.position_size) {
        skipped += 1;
        continue;
      }
      const key = dedupeKey({
        asset: t.asset,
        direction: t.direction,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        opened_at: t.opened_at,
      });
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      rows.push({
        user_id: params.userId,
        asset: t.asset,
        market: t.market,
        direction: t.direction,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        position_size: t.position_size,
        profit_loss: t.profit_loss,
        opened_at: t.opened_at,
        closed_at: t.closed_at,
        notes: `Synced from ${params.exchange} (read-only API)`,
      });
    }

    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await db.from("trades").insert(chunk as never);
      if (error) {
        errorCount += chunk.length;
        log.push(`error: insert failed — ${error.message}`);
      } else {
        imported += chunk.length;
      }
    }
    if (errorCount && !imported) status = "failed";
    else if (errorCount) status = "partial";
    log.push(`Imported ${imported}, duplicates ${duplicates}, skipped ${skipped}.`);
  } catch (e) {
    status = "failed";
    errorCount += 1;
    log.push(`error: ${(e as Error).message}`);
  }

  const durationMs = Date.now() - started;

  await db.from("exchange_sync_runs").insert({
    user_id: params.userId,
    connection_id: params.connectionId,
    exchange: params.exchange,
    scopes: params.scopes,
    imported_count: imported,
    skipped_count: skipped,
    duplicate_count: duplicates,
    error_count: errorCount,
    duration_ms: durationMs,
    status,
    log: log as never,
  } as never);

  const { data: conn } = await db
    .from("exchange_connections")
    .select("imported_trades")
    .eq("id", params.connectionId)
    .maybeSingle();

  await db
    .from("exchange_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      api_status: status === "failed" ? "error" : "operational",
      imported_trades: (conn?.imported_trades ?? 0) + imported,
    })
    .eq("id", params.connectionId);

  return { imported, skipped, duplicates, errors: errorCount, durationMs, status, log };
}
