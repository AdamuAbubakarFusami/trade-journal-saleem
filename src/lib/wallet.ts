// Client-safe constants and types for the DEX Wallet Tracking module.
// Read-only tracking: SaleemJournal never asks for private keys or seed phrases.

export const CHAINS = ["solana", "ethereum", "base", "arbitrum", "bnb"] as const;
export type ChainId = (typeof CHAINS)[number];

export const WALLET_PROVIDERS = ["phantom", "metamask", "walletconnect", "manual"] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

export type ChainMeta = {
  id: ChainId;
  label: string;
  family: "svm" | "evm";
  native: string;
  accent: string;
  explorerTx: (hash: string) => string;
  providers: WalletProvider[];
};

export const CHAIN_META: Record<ChainId, ChainMeta> = {
  solana: {
    id: "solana",
    label: "Solana",
    family: "svm",
    native: "SOL",
    accent: "text-violet-300",
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    providers: ["phantom", "manual"],
  },
  ethereum: {
    id: "ethereum",
    label: "Ethereum",
    family: "evm",
    native: "ETH",
    accent: "text-indigo-300",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    providers: ["metamask", "walletconnect", "manual"],
  },
  base: {
    id: "base",
    label: "Base",
    family: "evm",
    native: "ETH",
    accent: "text-sky-300",
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
    providers: ["metamask", "walletconnect", "manual"],
  },
  arbitrum: {
    id: "arbitrum",
    label: "Arbitrum",
    family: "evm",
    native: "ETH",
    accent: "text-cyan-300",
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    providers: ["metamask", "walletconnect", "manual"],
  },
  bnb: {
    id: "bnb",
    label: "BNB Chain",
    family: "evm",
    native: "BNB",
    accent: "text-amber-300",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    providers: ["metamask", "walletconnect", "manual"],
  },
};

export const CHAIN_LIST = CHAINS.map((c) => CHAIN_META[c]);

export const PROVIDER_LABEL: Record<WalletProvider, string> = {
  phantom: "Phantom",
  metamask: "MetaMask",
  walletconnect: "WalletConnect",
  manual: "Watch address",
};

export type WalletRow = {
  id: string;
  chain: string;
  address: string;
  label: string;
  provider: string;
  status: string;
  native_balance: number | null;
  native_symbol: string | null;
  auto_sync: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  discovered_trades: number;
  imported_trades: number;
  created_at: string;
};

export type WalletSwap = {
  id: string;
  wallet_id: string;
  chain: string;
  tx_hash: string;
  block_time: string;
  kind: string;
  direction: string;
  token_in: string | null;
  token_out: string | null;
  asset: string;
  amount_in: number | null;
  amount_out: number | null;
  price: number | null;
  value_usd: number | null;
  fee_usd: number | null;
  status: string;
  trade_id: string | null;
  created_at: string;
};

export type WalletSyncRun = {
  id: string;
  wallet_id: string | null;
  chain: string;
  address: string;
  discovered_count: number;
  imported_count: number;
  skipped_count: number;
  duplicate_count: number;
  error_count: number;
  duration_ms: number;
  status: string;
  log: unknown;
  created_at: string;
};

export function shortAddress(a: string) {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function isValidAddress(chain: ChainId, address: string) {
  const a = address.trim();
  if (CHAIN_META[chain].family === "evm") return /^0x[a-fA-F0-9]{40}$/.test(a);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}
