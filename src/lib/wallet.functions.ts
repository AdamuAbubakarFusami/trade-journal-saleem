import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHAINS, WALLET_PROVIDERS, CHAIN_META, isValidAddress } from "./wallet";

const ChainEnum = z.enum(CHAINS);

const AddSchema = z.object({
  chain: ChainEnum,
  address: z.string().min(24).max(120),
  label: z.string().max(60).optional().default(""),
  provider: z.enum(WALLET_PROVIDERS).optional().default("manual"),
  autoSync: z.boolean().optional().default(false),
});

export const addWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddSchema.parse(input))
  .handler(async ({ data, context }) => {
    const address = data.address.trim();
    if (!isValidAddress(data.chain, address)) {
      return { ok: false as const, message: `That does not look like a valid ${CHAIN_META[data.chain].label} address.` };
    }
    const { data: row, error } = await context.supabase
      .from("wallets")
      .upsert(
        {
          user_id: context.userId,
          chain: data.chain,
          address,
          label: data.label ?? "",
          provider: data.provider ?? "manual",
          status: "connected",
          auto_sync: data.autoSync ?? false,
          native_symbol: CHAIN_META[data.chain].native,
        } as never,
        { onConflict: "user_id,chain,address" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: (row as { id: string }).id, message: "Wallet is now tracked read-only." };
  });

export const removeWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ walletId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wallets")
      .delete()
      .eq("id", data.walletId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateWalletSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        walletId: z.string().uuid(),
        autoSync: z.boolean().optional(),
        label: z.string().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.autoSync !== undefined) patch["auto_sync"] = data.autoSync;
    if (data.label !== undefined) patch["label"] = data.label;
    const { error } = await context.supabase
      .from("wallets")
      .update(patch as never)
      .eq("id", data.walletId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const scanWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ walletId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: wallet, error } = await context.supabase
      .from("wallets")
      .select("id, chain, address")
      .eq("id", data.walletId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wallet) throw new Error("Wallet not found");

    const parsed = z
      .object({ id: z.string(), chain: ChainEnum, address: z.string() })
      .parse(wallet);

    const { syncWallet } = await import("./wallet-sync.server");
    return syncWallet(context.supabase as never, {
      userId: context.userId,
      walletId: parsed.id,
      chain: parsed.chain,
      address: parsed.address,
    });
  });

export const importWalletSwaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ swapIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: swaps, error } = await context.supabase
      .from("wallet_swaps")
      .select("*")
      .in("id", data.swapIds)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    const rows = (swaps ?? []) as unknown as {
      id: string;
      wallet_id: string;
      chain: string;
      tx_hash: string;
      block_time: string;
      direction: string;
      asset: string;
      token_in: string | null;
      token_out: string | null;
      amount_in: number | null;
      amount_out: number | null;
      price: number | null;
      fee_usd: number | null;
    }[];

    let imported = 0;
    const perWallet = new Map<string, number>();

    for (const s of rows) {
      const size = s.direction === "long" ? s.amount_out : s.amount_in;
      const payload = {
        user_id: context.userId,
        asset: s.asset || "UNKNOWN",
        market: "dex",
        direction: s.direction,
        entry_price: s.direction === "long" ? s.price : null,
        exit_price: s.direction === "short" ? s.price : null,
        position_size: size,
        profit_loss: 0,
        opened_at: s.block_time,
        closed_at: s.direction === "short" ? s.block_time : null,
        notes: `On-chain swap on ${s.chain}. ${s.token_in ?? "?"} → ${s.token_out ?? "?"}. Tx ${s.tx_hash}`,
      };
      const { data: trade, error: tErr } = await context.supabase
        .from("trades")
        .insert(payload as never)
        .select("id")
        .single();
      if (tErr) continue;
      await context.supabase
        .from("wallet_swaps")
        .update({ status: "imported", trade_id: (trade as { id: string }).id } as never)
        .eq("id", s.id);
      imported += 1;
      perWallet.set(s.wallet_id, (perWallet.get(s.wallet_id) ?? 0) + 1);
    }

    for (const [walletId, count] of perWallet) {
      const { data: w } = await context.supabase
        .from("wallets")
        .select("imported_trades")
        .eq("id", walletId)
        .maybeSingle();
      await context.supabase
        .from("wallets")
        .update({ imported_trades: ((w as { imported_trades: number } | null)?.imported_trades ?? 0) + count } as never)
        .eq("id", walletId);
    }

    return { ok: true as const, imported, skipped: rows.length - imported };
  });

export const skipWalletSwaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ swapIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("wallet_swaps")
      .update({ status: "skipped" } as never)
      .in("id", data.swapIds)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true as const, skipped: data.swapIds.length };
  });
