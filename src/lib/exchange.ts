// Client-safe constants and types for the Exchange Connections module.

export const EXCHANGES = ["binance", "bybit", "okx", "bitget", "mexc"] as const;
export type ExchangeId = (typeof EXCHANGES)[number];

export const SCOPES = ["spot", "futures", "margin", "options"] as const;
export type SyncScope = (typeof SCOPES)[number];

export type ExchangeMeta = {
  id: ExchangeId;
  label: string;
  passphrase: boolean;
  scopes: SyncScope[];
  accent: string;
  hint: string;
};

export const EXCHANGE_META: Record<ExchangeId, ExchangeMeta> = {
  binance: {
    id: "binance",
    label: "Binance",
    passphrase: false,
    scopes: ["spot", "futures", "margin"],
    accent: "text-amber-400",
    hint: "API Management → create key with Read-Only (Enable Reading) permission only.",
  },
  bybit: {
    id: "bybit",
    label: "Bybit",
    passphrase: false,
    scopes: ["spot", "futures", "options"],
    accent: "text-orange-400",
    hint: "API → create a Read-Only key with Orders/Positions read access.",
  },
  okx: {
    id: "okx",
    label: "OKX",
    passphrase: true,
    scopes: ["spot", "futures", "margin", "options"],
    accent: "text-sky-300",
    hint: "API keys require a passphrase. Select the Read permission only.",
  },
  bitget: {
    id: "bitget",
    label: "Bitget",
    passphrase: true,
    scopes: ["spot", "futures"],
    accent: "text-cyan-300",
    hint: "API keys require a passphrase. Choose Read-Only permission.",
  },
  mexc: {
    id: "mexc",
    label: "MEXC",
    passphrase: false,
    scopes: ["spot", "futures"],
    accent: "text-emerald-300",
    hint: "API Management → enable only 'Read' access for spot data.",
  },
};

export const EXCHANGE_LIST = EXCHANGES.map((id) => EXCHANGE_META[id]);

export type ExchangeConnection = {
  id: string;
  exchange: string;
  label: string;
  status: string;
  api_status: string;
  auto_sync: boolean;
  scopes: string[];
  last_sync_at: string | null;
  last_sync_status: string | null;
  imported_trades: number;
  created_at: string;
};

export type SyncRun = {
  id: string;
  exchange: string;
  connection_id: string | null;
  scopes: string[];
  imported_count: number;
  skipped_count: number;
  duplicate_count: number;
  error_count: number;
  duration_ms: number;
  status: string;
  log: unknown;
  created_at: string;
};

export function scopeLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
