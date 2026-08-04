// Professional CSV import engine for SaleemJournal.
// Deterministic: parses, maps, validates and normalises broker exports.
// Never invents data — unknown fields stay null and render as "Missing information".

export const MISSING = "Missing information";
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

export const PLATFORMS = [
  "binance",
  "bybit",
  "okx",
  "bitget",
  "mexc",
  "mt4",
  "mt5",
  "tradingview",
  "generic",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<Platform, string> = {
  binance: "Binance",
  bybit: "Bybit",
  okx: "OKX",
  bitget: "Bitget",
  mexc: "MEXC",
  mt4: "MetaTrader 4",
  mt5: "MetaTrader 5",
  tradingview: "TradingView Export",
  generic: "Generic CSV",
};

export const PLATFORM_MARKET: Record<Platform, string> = {
  binance: "crypto",
  bybit: "crypto",
  okx: "crypto",
  bitget: "crypto",
  mexc: "crypto",
  mt4: "forex",
  mt5: "forex",
  tradingview: "forex",
  generic: "forex",
};

export type FieldKey =
  | "asset"
  | "market"
  | "direction"
  | "entry_price"
  | "exit_price"
  | "stop_loss"
  | "take_profit"
  | "position_size"
  | "profit_loss"
  | "opened_at"
  | "closed_at"
  | "strategy"
  | "notes";

export type FieldDef = {
  key: FieldKey;
  label: string;
  kind: "text" | "number" | "date";
  required: boolean;
  aliases: string[];
};

export const FIELDS: FieldDef[] = [
  {
    key: "asset",
    label: "Asset",
    kind: "text",
    required: true,
    aliases: ["asset", "symbol", "pair", "instrument", "market", "ticker", "contracts", "coin"],
  },
  {
    key: "market",
    label: "Market",
    kind: "text",
    required: false,
    aliases: ["market", "markettype", "assetclass", "category", "producttype"],
  },
  {
    key: "direction",
    label: "Direction",
    kind: "text",
    required: true,
    aliases: ["direction", "side", "type", "positionside", "buysell", "ordertype", "action", "longshort"],
  },
  {
    key: "entry_price",
    label: "Entry price",
    kind: "number",
    required: false,
    aliases: ["entryprice", "entry", "openprice", "priceopen", "avgentryprice", "price", "openavgprice", "entryavgprice"],
  },
  {
    key: "exit_price",
    label: "Exit price",
    kind: "number",
    required: false,
    aliases: ["exitprice", "exit", "closeprice", "priceclose", "avgexitprice", "closeavgprice", "avgclosingprice"],
  },
  {
    key: "stop_loss",
    label: "Stop loss",
    kind: "number",
    required: false,
    aliases: ["stoploss", "sl", "stop", "stopprice", "slprice"],
  },
  {
    key: "take_profit",
    label: "Take profit",
    kind: "number",
    required: false,
    aliases: ["takeprofit", "tp", "target", "tpprice", "profittarget"],
  },
  {
    key: "position_size",
    label: "Position size",
    kind: "number",
    required: false,
    aliases: ["positionsize", "size", "quantity", "qty", "volume", "amount", "lots", "filledqty", "executedqty", "contracts"],
  },
  {
    key: "profit_loss",
    label: "Profit / Loss",
    kind: "number",
    required: true,
    aliases: ["profitloss", "pnl", "profit", "realizedpnl", "netpnl", "netprofit", "closedpnl", "realizedprofit", "grossprofit", "pl", "result"],
  },
  {
    key: "opened_at",
    label: "Open date",
    kind: "date",
    required: true,
    aliases: ["openedat", "opentime", "opendate", "entrytime", "entrydate", "datetime", "date", "time", "createtime", "tradetime", "createdat"],
  },
  {
    key: "closed_at",
    label: "Close date",
    kind: "date",
    required: false,
    aliases: ["closedat", "closetime", "closedate", "exittime", "exitdate", "updatetime"],
  },
  {
    key: "strategy",
    label: "Strategy",
    kind: "text",
    required: false,
    aliases: ["strategy", "setup", "system", "playbook", "tag", "tags"],
  },
  {
    key: "notes",
    label: "Notes",
    kind: "text",
    required: false,
    aliases: ["notes", "note", "comment", "comments", "remark", "description"],
  },
];

export type Mapping = Partial<Record<FieldKey, string>>;

/* ------------------------------- CSV parsing ------------------------------ */

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; emptyRows: number };

export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const table = splitRows(clean, delimiter);
  if (!table.length) return { headers: [], rows: [], emptyRows: 0 };

  const headers = table[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows: Record<string, string>[] = [];
  let emptyRows = 0;

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells.length || cells.every((c) => c.trim() === "")) {
      emptyRows += 1;
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows, emptyRows };
}

function detectDelimiter(text: string) {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts: Record<string, number> = {
    ",": (line.match(/,/g) ?? []).length,
    ";": (line.match(/;/g) ?? []).length,
    "\t": (line.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitRows(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // ignore
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) out.push(row);
  return out;
}

/* ------------------------------- Auto mapping ----------------------------- */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function autoMap(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set<string>();
  for (const field of FIELDS) {
    const exact = headers.find((h) => !used.has(h) && field.aliases.includes(norm(h)));
    const partial =
      exact ??
      headers.find(
        (h) => !used.has(h) && field.aliases.some((a) => a.length > 3 && norm(h).includes(a)),
      );
    if (partial) {
      mapping[field.key] = partial;
      used.add(partial);
    }
  }
  return mapping;
}

/* --------------------------------- Values --------------------------------- */

export function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  let v = raw.trim();
  if (!v || /^(n\/a|na|-|--|null|undefined)$/i.test(v)) return null;
  const negative = /^\(.*\)$/.test(v) || v.startsWith("-");
  v = v.replace(/[()]/g, "").replace(/[^0-9.,-]/g, "");
  if (v.includes(",") && v.includes(".")) v = v.replace(/,/g, "");
  else if ((v.match(/,/g) ?? []).length === 1 && !v.includes(".")) v = v.replace(",", ".");
  else v = v.replace(/,/g, "");
  v = v.replace(/-/g, "");
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  // Epoch seconds / milliseconds
  if (/^\d{10}$/.test(v)) return new Date(Number(v) * 1000).toISOString();
  if (/^\d{13}$/.test(v)) return new Date(Number(v)).toISOString();

  // DD/MM/YYYY or MM/DD/YYYY with optional time
  const slash = v.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const day = a > 12 ? a : b > 12 ? b : a;
    const month = a > 12 ? b : b > 12 ? a : b;
    const d = new Date(
      Date.UTC(Number(slash[3]), month - 1, day, Number(slash[4] ?? 0), Number(slash[5] ?? 0), Number(slash[6] ?? 0)),
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const iso = new Date(v.includes(" ") && !v.includes("T") ? v.replace(" ", "T") : v);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  const fallback = new Date(v);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

const SHORT_WORDS = ["short", "sell", "sel", "s", "bearish", "sellshort", "sellstop", "selllimit"];
const LONG_WORDS = ["long", "buy", "b", "bullish", "buylong", "buystop", "buylimit"];

export function parseDirection(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = norm(raw);
  if (!v) return null;
  if (SHORT_WORDS.some((w) => v === w || v.includes("short") || v.includes("sell"))) return "short";
  if (LONG_WORDS.some((w) => v === w || v.includes("long") || v.includes("buy"))) return "long";
  return null;
}

const KNOWN_MARKETS = ["forex", "crypto", "stocks", "options", "dex", "indices", "futures"];

export function parseMarket(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const v = norm(raw);
  const hit = KNOWN_MARKETS.find((m) => v.includes(m));
  if (hit) return hit;
  if (v.includes("spot") || v.includes("perp") || v.includes("swap")) return "crypto";
  if (v.includes("equity") || v.includes("share")) return "stocks";
  return fallback;
}

/* -------------------------------- Normalise -------------------------------- */

export type ImportIssue = { field: FieldKey | "row"; message: string; severity: "error" | "warning" };

export type StagedTrade = {
  rowNumber: number;
  values: {
    asset: string | null;
    market: string;
    direction: string | null;
    entry_price: number | null;
    exit_price: number | null;
    stop_loss: number | null;
    take_profit: number | null;
    position_size: number | null;
    profit_loss: number | null;
    rr_ratio: number | null;
    opened_at: string | null;
    closed_at: string | null;
    strategy: string | null;
    notes: string | null;
  };
  issues: ImportIssue[];
  status: "ready" | "duplicate" | "error";
  duplicateOf: "file" | "journal" | null;
  include: boolean;
};

export function computeRr(v: {
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  direction: string | null;
}): number | null {
  const { entry_price: e, stop_loss: sl, take_profit: tp, exit_price: x } = v;
  if (e == null || sl == null) return null;
  const risk = Math.abs(e - sl);
  if (!risk) return null;
  const target = tp ?? x;
  if (target == null) return null;
  const reward = Math.abs(target - e);
  const rr = reward / risk;
  return Number.isFinite(rr) ? Number(rr.toFixed(2)) : null;
}

export function dedupeKey(v: {
  asset: string | null;
  direction: string | null;
  entry_price: number | null;
  exit_price: number | null;
  opened_at: string | null;
}) {
  return [
    (v.asset ?? "").toUpperCase(),
    v.direction ?? "",
    v.entry_price ?? "",
    v.exit_price ?? "",
    v.opened_at ? v.opened_at.slice(0, 16) : "",
  ].join("|");
}

export type ExistingTradeKey = {
  asset: string;
  direction: string;
  entry_price: number | null;
  exit_price: number | null;
  opened_at: string;
};

export function buildStagedTrades(
  rows: Record<string, string>[],
  mapping: Mapping,
  platform: Platform,
  existing: ExistingTradeKey[],
): StagedTrade[] {
  const existingKeys = new Set(
    existing.map((t) =>
      dedupeKey({
        asset: t.asset,
        direction: t.direction,
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        opened_at: t.opened_at,
      }),
    ),
  );
  const seen = new Set<string>();
  const fallbackMarket = PLATFORM_MARKET[platform];

  return rows.map((row, index) => {
    const get = (key: FieldKey) => {
      const col = mapping[key];
      return col ? row[col] : undefined;
    };
    const issues: ImportIssue[] = [];

    const rawAsset = (get("asset") ?? "").trim();
    const asset = rawAsset ? rawAsset.toUpperCase() : null;
    if (!asset) issues.push({ field: "asset", message: "Asset is missing", severity: "error" });

    const direction = parseDirection(get("direction"));
    if (!direction)
      issues.push({
        field: "direction",
        message: get("direction") ? "Direction not recognised" : "Direction is missing",
        severity: "error",
      });

    const numeric = (key: FieldKey) => {
      const raw = get(key);
      const parsed = parseNumber(raw);
      if (raw && raw.trim() && parsed === null)
        issues.push({ field: key, message: `Invalid number in ${key}`, severity: "warning" });
      return parsed;
    };

    const profit_loss = numeric("profit_loss");
    if (profit_loss === null)
      issues.push({ field: "profit_loss", message: "Profit/Loss is missing or invalid", severity: "error" });

    const opened_at = parseDate(get("opened_at"));
    if (!opened_at)
      issues.push({
        field: "opened_at",
        message: get("opened_at") ? "Invalid date format" : "Open date is missing",
        severity: "error",
      });

    const closedRaw = get("closed_at");
    const closed_at = parseDate(closedRaw);
    if (closedRaw && closedRaw.trim() && !closed_at)
      issues.push({ field: "closed_at", message: "Invalid close date", severity: "warning" });

    const values = {
      asset,
      market: parseMarket(get("market"), fallbackMarket),
      direction,
      entry_price: numeric("entry_price"),
      exit_price: numeric("exit_price"),
      stop_loss: numeric("stop_loss"),
      take_profit: numeric("take_profit"),
      position_size: numeric("position_size"),
      profit_loss,
      rr_ratio: null as number | null,
      opened_at,
      closed_at,
      strategy: (get("strategy") ?? "").trim() || null,
      notes: (get("notes") ?? "").trim() || null,
    };
    values.rr_ratio = computeRr(values);

    const hasError = issues.some((i) => i.severity === "error");
    let status: StagedTrade["status"] = hasError ? "error" : "ready";
    let duplicateOf: StagedTrade["duplicateOf"] = null;

    if (!hasError) {
      const key = dedupeKey(values);
      if (existingKeys.has(key)) {
        status = "duplicate";
        duplicateOf = "journal";
      } else if (seen.has(key)) {
        status = "duplicate";
        duplicateOf = "file";
      } else {
        seen.add(key);
      }
    }

    return {
      rowNumber: index + 2,
      values,
      issues,
      status,
      duplicateOf,
      include: status === "ready",
    };
  });
}

export const fmtValue = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? MISSING : String(v);
