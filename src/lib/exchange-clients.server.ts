// Server-only: read-only REST clients for supported exchanges.
// This module performs GET requests against private read endpoints only.
// It never places, cancels or modifies orders, and never moves funds.

import type { ExchangeId, SyncScope } from "./exchange";

export type Credentials = { apiKey: string; apiSecret: string; passphrase?: string | null };

export type RawFill = {
  symbol: string;
  side: "buy" | "sell";
  price: number;
  qty: number;
  time: number;
  fee: number;
  market: string;
};

export type FetchResult = { fills: RawFill[]; errors: string[] };

export type ClosedTrade = {
  asset: string;
  market: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  position_size: number;
  profit_loss: number;
  opened_at: string;
  closed_at: string;
};

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(buf: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { msg: text.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = body?.msg ?? body?.message ?? body?.retMsg ?? `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return body;
}

/* ---------------------------------- Binance / MEXC (MBX style) --------------------------------- */

type MbxConfig = { base: string; futuresBase?: string; header: string };

const MBX: Record<"binance" | "mexc", MbxConfig> = {
  binance: { base: "https://api.binance.com", futuresBase: "https://fapi.binance.com", header: "X-MBX-APIKEY" },
  mexc: { base: "https://api.mexc.com", header: "X-MEXC-APIKEY" },
};

async function mbxGet(cfg: MbxConfig, creds: Credentials, base: string, path: string, params: Record<string, string | number> = {}) {
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
    recvWindow: "10000",
  }).toString();
  const signature = hex(await hmac(creds.apiSecret, query));
  return getJson(`${base}${path}?${query}&signature=${signature}`, { [cfg.header]: creds.apiKey });
}

async function mbxSymbols(cfg: MbxConfig, creds: Credentials): Promise<string[]> {
  const account = await mbxGet(cfg, creds, cfg.base, "/api/v3/account");
  const balances: any[] = account?.balances ?? [];
  const quotes = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD"]);
  return balances
    .filter((b) => num(b.free) + num(b.locked) > 0 && !quotes.has(String(b.asset)))
    .map((b) => `${String(b.asset)}USDT`)
    .slice(0, 12);
}

async function mbxFills(exchange: "binance" | "mexc", creds: Credentials, scopes: SyncScope[]): Promise<FetchResult> {
  const cfg = MBX[exchange];
  const fills: RawFill[] = [];
  const errors: string[] = [];
  let symbols: string[] = [];
  try {
    symbols = await mbxSymbols(cfg, creds);
  } catch (e) {
    errors.push(`Account read failed: ${(e as Error).message}`);
    return { fills, errors };
  }
  if (!symbols.length) errors.push("No non-zero balances found to resolve tradable symbols.");

  const pull = async (base: string, path: string, market: string, extra: Record<string, string> = {}) => {
    for (const symbol of symbols) {
      try {
        const rows: any[] = await mbxGet(cfg, creds, base, path, { symbol, limit: 200, ...extra });
        for (const r of rows ?? []) {
          fills.push({
            symbol,
            side: r.isBuyer === true || String(r.side ?? "").toUpperCase() === "BUY" ? "buy" : "sell",
            price: num(r.price),
            qty: num(r.qty),
            time: num(r.time),
            fee: num(r.commission),
            market,
          });
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (!/invalid symbol/i.test(msg)) errors.push(`${market} ${symbol}: ${msg}`);
      }
    }
  };

  if (scopes.includes("spot")) await pull(cfg.base, "/api/v3/myTrades", "crypto");
  if (scopes.includes("margin") && exchange === "binance")
    await pull(cfg.base, "/sapi/v1/margin/myTrades", "crypto", { isIsolated: "FALSE" });
  if (scopes.includes("futures")) {
    if (exchange === "binance" && cfg.futuresBase) {
      await pull(cfg.futuresBase, "/fapi/v1/userTrades", "futures");
    } else {
      errors.push("MEXC futures history is not available through API keys.");
    }
  }
  if (scopes.includes("options")) errors.push(`${exchange} options sync is not supported.`);
  return { fills, errors };
}

/* --------------------------------------------- Bybit -------------------------------------------- */

async function bybitGet(creds: Credentials, path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const ts = String(Date.now());
  const recv = "10000";
  const sign = hex(await hmac(creds.apiSecret, ts + creds.apiKey + recv + query));
  return getJson(`https://api.bybit.com${path}?${query}`, {
    "X-BAPI-API-KEY": creds.apiKey,
    "X-BAPI-TIMESTAMP": ts,
    "X-BAPI-RECV-WINDOW": recv,
    "X-BAPI-SIGN": await sign,
  });
}

const BYBIT_CATEGORY: Partial<Record<SyncScope, { category: string; market: string }>> = {
  spot: { category: "spot", market: "crypto" },
  futures: { category: "linear", market: "futures" },
  options: { category: "option", market: "options" },
};

async function bybitFills(creds: Credentials, scopes: SyncScope[]): Promise<FetchResult> {
  const fills: RawFill[] = [];
  const errors: string[] = [];
  for (const scope of scopes) {
    const cat = BYBIT_CATEGORY[scope];
    if (!cat) {
      errors.push(`Bybit ${scope} sync is not supported.`);
      continue;
    }
    try {
      const body = await bybitGet(creds, "/v5/execution/list", { category: cat.category, limit: "100" });
      if (body?.retCode && body.retCode !== 0) throw new Error(body.retMsg ?? "Bybit error");
      for (const r of body?.result?.list ?? []) {
        fills.push({
          symbol: String(r.symbol),
          side: String(r.side).toLowerCase() === "buy" ? "buy" : "sell",
          price: num(r.execPrice),
          qty: num(r.execQty),
          time: num(r.execTime),
          fee: num(r.execFee),
          market: cat.market,
        });
      }
    } catch (e) {
      errors.push(`${scope}: ${(e as Error).message}`);
    }
  }
  return { fills, errors };
}

/* ---------------------------------------------- OKX --------------------------------------------- */

async function okxGet(creds: Credentials, path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const requestPath = query ? `${path}?${query}` : path;
  const ts = new Date().toISOString();
  const sign = b64(await hmac(creds.apiSecret, `${ts}GET${requestPath}`));
  return getJson(`https://www.okx.com${requestPath}`, {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": creds.passphrase ?? "",
    "Content-Type": "application/json",
  });
}

const OKX_INST: Record<SyncScope, { instType: string; market: string }> = {
  spot: { instType: "SPOT", market: "crypto" },
  futures: { instType: "SWAP", market: "futures" },
  margin: { instType: "MARGIN", market: "crypto" },
  options: { instType: "OPTION", market: "options" },
};

async function okxFills(creds: Credentials, scopes: SyncScope[]): Promise<FetchResult> {
  const fills: RawFill[] = [];
  const errors: string[] = [];
  for (const scope of scopes) {
    const cfg = OKX_INST[scope];
    try {
      const body = await okxGet(creds, "/api/v5/trade/fills-history", {
        instType: cfg.instType,
        limit: "100",
      });
      if (body?.code && body.code !== "0") throw new Error(body.msg || "OKX error");
      for (const r of body?.data ?? []) {
        fills.push({
          symbol: String(r.instId),
          side: String(r.side).toLowerCase() === "buy" ? "buy" : "sell",
          price: num(r.fillPx),
          qty: num(r.fillSz),
          time: num(r.ts),
          fee: Math.abs(num(r.fee)),
          market: cfg.market,
        });
      }
    } catch (e) {
      errors.push(`${scope}: ${(e as Error).message}`);
    }
  }
  return { fills, errors };
}

/* -------------------------------------------- Bitget -------------------------------------------- */

async function bitgetGet(creds: Credentials, path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const requestPath = query ? `${path}?${query}` : path;
  const ts = String(Date.now());
  const sign = b64(await hmac(creds.apiSecret, `${ts}GET${requestPath}`));
  return getJson(`https://api.bitget.com${requestPath}`, {
    "ACCESS-KEY": creds.apiKey,
    "ACCESS-SIGN": sign,
    "ACCESS-TIMESTAMP": ts,
    "ACCESS-PASSPHRASE": creds.passphrase ?? "",
    "Content-Type": "application/json",
    locale: "en-US",
  });
}

async function bitgetFills(creds: Credentials, scopes: SyncScope[]): Promise<FetchResult> {
  const fills: RawFill[] = [];
  const errors: string[] = [];
  const push = (rows: any[], market: string) => {
    for (const r of rows ?? []) {
      fills.push({
        symbol: String(r.symbol),
        side: String(r.side ?? r.tradeSide ?? "").toLowerCase().includes("sell") ? "sell" : "buy",
        price: num(r.priceAvg ?? r.price),
        qty: num(r.baseVolume ?? r.size ?? r.baseSize),
        time: num(r.cTime ?? r.uTime),
        fee: Math.abs(num(r.feeDetail?.[0]?.totalFee ?? r.fee)),
        market,
      });
    }
  };
  for (const scope of scopes) {
    try {
      if (scope === "spot") {
        const body = await bitgetGet(creds, "/api/v2/spot/trade/fills", { limit: "100" });
        if (body?.code && body.code !== "00000") throw new Error(body.msg ?? "Bitget error");
        push(body?.data ?? [], "crypto");
      } else if (scope === "futures") {
        const body = await bitgetGet(creds, "/api/v2/mix/order/fills", {
          productType: "USDT-FUTURES",
          limit: "100",
        });
        if (body?.code && body.code !== "00000") throw new Error(body.msg ?? "Bitget error");
        push(body?.data?.fillList ?? body?.data ?? [], "futures");
      } else {
        errors.push(`Bitget ${scope} sync is not supported.`);
      }
    } catch (e) {
      errors.push(`${scope}: ${(e as Error).message}`);
    }
  }
  return { fills, errors };
}

/* ------------------------------------------- Public API ----------------------------------------- */

export async function verifyCredentials(
  exchange: ExchangeId,
  creds: Credentials,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (exchange === "binance" || exchange === "mexc") {
      await mbxGet(MBX[exchange], creds, MBX[exchange].base, "/api/v3/account");
    } else if (exchange === "bybit") {
      const body = await bybitGet(creds, "/v5/account/wallet-balance", { accountType: "UNIFIED" });
      if (body?.retCode && body.retCode !== 0) throw new Error(body.retMsg ?? "Bybit error");
    } else if (exchange === "okx") {
      const body = await okxGet(creds, "/api/v5/account/balance");
      if (body?.code && body.code !== "0") throw new Error(body.msg || "OKX error");
    } else {
      const body = await bitgetGet(creds, "/api/v2/spot/account/assets");
      if (body?.code && body.code !== "00000") throw new Error(body.msg ?? "Bitget error");
    }
    return { ok: true, message: "Read-only access verified" };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function fetchFills(
  exchange: ExchangeId,
  creds: Credentials,
  scopes: SyncScope[],
): Promise<FetchResult> {
  if (exchange === "binance" || exchange === "mexc") return mbxFills(exchange, creds, scopes);
  if (exchange === "bybit") return bybitFills(creds, scopes);
  if (exchange === "okx") return okxFills(creds, scopes);
  return bitgetFills(creds, scopes);
}

/**
 * Converts raw fills into completed round-trip trades using FIFO matching.
 * Unmatched inventory (i.e. still-open positions) is intentionally ignored.
 */
export function buildRoundTrips(fills: RawFill[]): ClosedTrade[] {
  const bySymbol = new Map<string, RawFill[]>();
  for (const f of fills) {
    if (!f.qty || !f.price || !f.time) continue;
    const key = `${f.market}|${f.symbol}`;
    const list = bySymbol.get(key) ?? [];
    list.push(f);
    bySymbol.set(key, list);
  }

  const out: ClosedTrade[] = [];
  for (const [key, list] of bySymbol) {
    const [market = "crypto", symbol = ""] = key.split("|");
    list.sort((a, b) => a.time - b.time);
    const longs: RawFill[] = [];
    const shorts: RawFill[] = [];

    for (const fill of list) {
      let remaining = fill.qty;
      const opposite = fill.side === "buy" ? shorts : longs;
      while (remaining > 0 && opposite.length) {
        const open = opposite[0]!;
        const qty = Math.min(remaining, open.qty);
        const direction = fill.side === "buy" ? "short" : "long";
        const entry = open.price;
        const exit = fill.price;
        const gross = direction === "long" ? (exit - entry) * qty : (entry - exit) * qty;
        const feeShare =
          (open.fee * (qty / (open.qty || qty)) + fill.fee * (qty / (fill.qty || qty))) || 0;
        out.push({
          asset: symbol,
          market,
          direction,
          entry_price: entry,
          exit_price: exit,
          position_size: Number(qty.toFixed(8)),
          profit_loss: Number((gross - feeShare).toFixed(4)),
          opened_at: new Date(open.time).toISOString(),
          closed_at: new Date(fill.time).toISOString(),
        });
        open.qty -= qty;
        remaining -= qty;
        if (open.qty <= 1e-12) opposite.shift();
      }
      if (remaining > 1e-12) {
        (fill.side === "buy" ? longs : shorts).push({ ...fill, qty: remaining });
      }
    }
  }
  return out.sort((a, b) => a.closed_at.localeCompare(b.closed_at));
}
