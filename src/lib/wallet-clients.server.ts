// Server-only read-only on-chain discovery for DEX wallet tracking.
// Only trading swaps are extracted. Transfers, NFTs, liquidity, staking and
// bridging are ignored. No private keys or seed phrases are ever handled.

import type { ChainId } from "./wallet";
import { CHAIN_META } from "./wallet";

export type DiscoveredSwap = {
  txHash: string;
  blockTime: string;
  direction: "long" | "short"; // long = bought token, short = sold token
  tokenIn: string;
  tokenOut: string;
  asset: string;
  amountIn: number | null;
  amountOut: number | null;
  price: number | null;
  valueUsd: number | null;
  feeUsd: number | null;
};

export type DiscoveryResult = {
  swaps: DiscoveredSwap[];
  errors: string[];
  nativeBalance: number | null;
};

const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "USDE", "FDUSD", "TUSD", "USDC.E"]);

const EVM_CHAIN_ID: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  bnb: 56,
};

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pricing(
  tokenIn: string,
  amountIn: number | null,
  tokenOut: string,
  amountOut: number | null,
) {
  // Price is only derived when one side is a stablecoin — never invented.
  if (!amountIn || !amountOut) return { price: null, valueUsd: null };
  if (STABLES.has(tokenIn.toUpperCase())) {
    return {
      price: Number((amountIn / amountOut).toFixed(8)),
      valueUsd: Number(amountIn.toFixed(2)),
    };
  }
  if (STABLES.has(tokenOut.toUpperCase())) {
    return {
      price: Number((amountOut / amountIn).toFixed(8)),
      valueUsd: Number(amountOut.toFixed(2)),
    };
  }
  return { price: null, valueUsd: null };
}

/* ---------------------------------- EVM ---------------------------------- */

type EtherscanTokenTx = {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenDecimal: string;
  tokenSymbol: string;
  gasUsed?: string;
  gasPrice?: string;
};

async function etherscan<T>(chainId: number, params: Record<string, string>, key: string) {
  const qs = new URLSearchParams({ ...params, chainid: String(chainId), apikey: key });
  const res = await fetch(`https://api.etherscan.io/v2/api?${qs.toString()}`);
  if (!res.ok) throw new Error(`Explorer request failed (${res.status})`);
  const json = (await res.json()) as { status: string; message: string; result: T };
  if (json.status !== "1" && !Array.isArray(json.result)) {
    throw new Error(typeof json.result === "string" ? json.result : json.message);
  }
  return json.result;
}

async function discoverEvm(
  chain: ChainId,
  address: string,
  limit: number,
): Promise<DiscoveryResult> {
  const key = process.env["ETHERSCAN_API_KEY"];
  const errors: string[] = [];
  if (!key) {
    return {
      swaps: [],
      errors: [
        "EVM scanning needs a blockchain explorer key. Add ETHERSCAN_API_KEY to enable Ethereum, Base, Arbitrum and BNB Chain discovery.",
      ],
      nativeBalance: null,
    };
  }
  const chainId = EVM_CHAIN_ID[chain]!;
  const addr = address.toLowerCase();

  let nativeBalance: number | null = null;
  try {
    const bal = await etherscan<string>(
      chainId,
      { module: "account", action: "balance", address: addr, tag: "latest" },
      key,
    );
    nativeBalance = Number(bal) / 1e18;
  } catch (e) {
    errors.push(`Balance unavailable: ${(e as Error).message}`);
  }

  let txs: EtherscanTokenTx[] = [];
  try {
    txs = await etherscan<EtherscanTokenTx[]>(
      chainId,
      {
        module: "account",
        action: "tokentx",
        address: addr,
        page: "1",
        offset: String(Math.min(limit * 4, 2000)),
        sort: "desc",
      },
      key,
    );
  } catch (e) {
    errors.push(`Token activity unavailable: ${(e as Error).message}`);
    return { swaps: [], errors, nativeBalance };
  }

  const byHash = new Map<string, EtherscanTokenTx[]>();
  for (const t of Array.isArray(txs) ? txs : []) {
    const list = byHash.get(t.hash) ?? [];
    list.push(t);
    byHash.set(t.hash, list);
  }

  const native = CHAIN_META[chain].native;
  const swaps: DiscoveredSwap[] = [];

  for (const [hash, list] of byHash) {
    const outs = list.filter((t) => t.from.toLowerCase() === addr);
    const ins = list.filter((t) => t.to.toLowerCase() === addr);
    // A trading swap moves value in BOTH directions inside one transaction.
    // Anything one-sided is a transfer/airdrop/bridge and is ignored.
    if (!outs.length || !ins.length) continue;

    const pick = (arr: EtherscanTokenTx[]) => {
      const best = arr.reduce((a, b) =>
        Number(b.value) / 10 ** Number(b.tokenDecimal) >
        Number(a.value) / 10 ** Number(a.tokenDecimal)
          ? b
          : a,
      );
      return {
        symbol: best.tokenSymbol || "TOKEN",
        amount: num(Number(best.value) / 10 ** Number(best.tokenDecimal || "18")),
        tx: best,
      };
    };
    const sold = pick(outs);
    const bought = pick(ins);
    if (sold.symbol === bought.symbol) continue; // wrap / rebase, not a trade

    const stableIn =
      STABLES.has(sold.symbol.toUpperCase()) || sold.symbol.toUpperCase() === `W${native}`;
    const direction: "long" | "short" = stableIn ? "long" : "short";
    const asset = direction === "long" ? bought.symbol : sold.symbol;
    const { price, valueUsd } = pricing(sold.symbol, sold.amount, bought.symbol, bought.amount);

    const gas =
      sold.tx.gasUsed && sold.tx.gasPrice
        ? (Number(sold.tx.gasUsed) * Number(sold.tx.gasPrice)) / 1e18
        : null;

    swaps.push({
      txHash: hash,
      blockTime: new Date(Number(sold.tx.timeStamp) * 1000).toISOString(),
      direction,
      tokenIn: sold.symbol,
      tokenOut: bought.symbol,
      asset,
      amountIn: sold.amount,
      amountOut: bought.amount,
      price,
      valueUsd,
      feeUsd: gas,
    });
    if (swaps.length >= limit) break;
  }

  return { swaps, errors, nativeBalance };
}

/* -------------------------------- Solana --------------------------------- */

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Solana RPC failed (${res.status})`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

type TokenBalance = {
  owner?: string;
  mint: string;
  uiTokenAmount: { uiAmount: number | null; decimals: number };
};

function mintLabel(mint: string) {
  const known: Record<string, string> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
    So11111111111111111111111111111111111111112: "SOL",
  };
  return known[mint] ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

async function discoverSolana(address: string, limit: number): Promise<DiscoveryResult> {
  const errors: string[] = [];
  let nativeBalance: number | null = null;
  try {
    const bal = await rpc<{ value: number }>("getBalance", [address]);
    nativeBalance = bal.value / 1e9;
  } catch (e) {
    errors.push(`Balance unavailable: ${(e as Error).message}`);
  }

  let sigs: { signature: string; blockTime: number | null; err: unknown }[] = [];
  try {
    sigs = await rpc("getSignaturesForAddress", [address, { limit: Math.min(limit * 2, 100) }]);
  } catch (e) {
    errors.push(`Activity unavailable: ${(e as Error).message}`);
    return { swaps: [], errors, nativeBalance };
  }

  const swaps: DiscoveredSwap[] = [];
  for (const sig of sigs) {
    if (sig.err) continue;
    if (swaps.length >= limit) break;
    try {
      const tx = await rpc<{
        meta: {
          fee: number;
          preTokenBalances: TokenBalance[];
          postTokenBalances: TokenBalance[];
          preBalances: number[];
          postBalances: number[];
        } | null;
        transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
        blockTime: number | null;
      }>("getTransaction", [
        sig.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      const meta = tx?.meta;
      if (!meta) continue;

      const deltas = new Map<string, number>();
      const own = (b: TokenBalance) => b.owner === address;
      for (const b of meta.preTokenBalances ?? []) {
        if (!own(b)) continue;
        deltas.set(b.mint, (deltas.get(b.mint) ?? 0) - (b.uiTokenAmount.uiAmount ?? 0));
      }
      for (const b of meta.postTokenBalances ?? []) {
        if (!own(b)) continue;
        deltas.set(b.mint, (deltas.get(b.mint) ?? 0) + (b.uiTokenAmount.uiAmount ?? 0));
      }

      // Native SOL delta excluding fee
      const keys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === "string" ? k : k.pubkey,
      );
      const idx = keys.indexOf(address);
      if (idx >= 0 && meta.preBalances && meta.postBalances) {
        const d = (meta.postBalances[idx]! - meta.preBalances[idx]! + meta.fee) / 1e9;
        if (Math.abs(d) > 0.000001) deltas.set("SOL_NATIVE", (deltas.get("SOL_NATIVE") ?? 0) + d);
      }

      const gains = [...deltas.entries()].filter(([, v]) => v > 1e-9);
      const losses = [...deltas.entries()].filter(([, v]) => v < -1e-9);
      // Swap requires one asset in and one asset out. Transfers/NFT mints/stakes are skipped.
      if (!gains.length || !losses.length) continue;

      const top = (arr: [string, number][]) =>
        arr.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
      const [inMint, inAmt] = top(losses);
      const [outMint, outAmt] = top(gains);
      const tokenIn = inMint === "SOL_NATIVE" ? "SOL" : mintLabel(inMint);
      const tokenOut = outMint === "SOL_NATIVE" ? "SOL" : mintLabel(outMint);
      if (tokenIn === tokenOut) continue;
      if (Math.abs(outAmt) === 1 && Number.isInteger(outAmt)) {
        const b = (meta.postTokenBalances ?? []).find((x) => x.mint === outMint);
        if (b && b.uiTokenAmount.decimals === 0) continue; // NFT
      }

      const quoteIsBase = tokenIn === "SOL" || STABLES.has(tokenIn.toUpperCase());
      const direction: "long" | "short" = quoteIsBase ? "long" : "short";
      const { price, valueUsd } = pricing(tokenIn, Math.abs(inAmt), tokenOut, Math.abs(outAmt));

      swaps.push({
        txHash: sig.signature,
        blockTime: new Date(
          (sig.blockTime ?? tx.blockTime ?? Date.now() / 1000) * 1000,
        ).toISOString(),
        direction,
        tokenIn,
        tokenOut,
        asset: direction === "long" ? tokenOut : tokenIn,
        amountIn: Number(Math.abs(inAmt).toFixed(8)),
        amountOut: Number(Math.abs(outAmt).toFixed(8)),
        price,
        valueUsd,
        feeUsd: Number((meta.fee / 1e9).toFixed(8)),
      });
    } catch (e) {
      errors.push(`${sig.signature.slice(0, 8)}…: ${(e as Error).message}`);
    }
  }

  return { swaps, errors, nativeBalance };
}

export async function discoverWalletSwaps(
  chain: ChainId,
  address: string,
  limit = 40,
): Promise<DiscoveryResult> {
  if (CHAIN_META[chain].family === "svm") return discoverSolana(address, limit);
  return discoverEvm(chain, address, limit);
}
