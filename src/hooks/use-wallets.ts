import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { WalletRow, WalletSwap, WalletSyncRun } from "@/lib/wallet";
import {
  addWallet,
  importWalletSwaps,
  removeWallet,
  scanWallet,
  skipWalletSwaps,
  updateWalletSettings,
} from "@/lib/wallet.functions";

export function useWallets() {
  return useQuery({
    queryKey: ["wallets"],
    queryFn: async (): Promise<WalletRow[]> => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as WalletRow[];
    },
  });
}

export function useWalletSwaps() {
  return useQuery({
    queryKey: ["wallet-swaps"],
    queryFn: async (): Promise<WalletSwap[]> => {
      const { data, error } = await supabase
        .from("wallet_swaps")
        .select("*")
        .order("block_time", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as WalletSwap[];
    },
  });
}

export function useWalletSyncRuns() {
  return useQuery({
    queryKey: ["wallet-sync-runs"],
    queryFn: async (): Promise<WalletSyncRun[]> => {
      const { data, error } = await supabase
        .from("wallet_sync_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as WalletSyncRun[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["wallets"] });
    qc.invalidateQueries({ queryKey: ["wallet-swaps"] });
    qc.invalidateQueries({ queryKey: ["wallet-sync-runs"] });
    qc.invalidateQueries({ queryKey: ["trades"] });
  };
}

export function useAddWallet() {
  const fn = useServerFn(addWallet);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      chain: string;
      address: string;
      label?: string;
      provider?: string;
      autoSync?: boolean;
    }) => fn({ data: input as never }),
    onSuccess: invalidate,
  });
}

export function useRemoveWallet() {
  const fn = useServerFn(removeWallet);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (walletId: string) => fn({ data: { walletId } }),
    onSuccess: invalidate,
  });
}

export function useUpdateWallet() {
  const fn = useServerFn(updateWalletSettings);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { walletId: string; autoSync?: boolean; label?: string }) =>
      fn({ data: input }),
    onSuccess: invalidate,
  });
}

export function useScanWallet() {
  const fn = useServerFn(scanWallet);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (walletId: string) => fn({ data: { walletId } }),
    onSuccess: invalidate,
  });
}

export function useImportSwaps() {
  const fn = useServerFn(importWalletSwaps);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (swapIds: string[]) => fn({ data: { swapIds } }),
    onSuccess: invalidate,
  });
}

export function useSkipSwaps() {
  const fn = useServerFn(skipWalletSwaps);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (swapIds: string[]) => fn({ data: { swapIds } }),
    onSuccess: invalidate,
  });
}
