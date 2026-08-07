import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { ExchangeConnection, SyncRun } from "@/lib/exchange";
import {
  connectExchange,
  disconnectExchange,
  syncExchange,
  updateExchangeSettings,
} from "@/lib/exchange.functions";

export function useExchangeConnections() {
  return useQuery({
    queryKey: ["exchange-connections"],
    queryFn: async (): Promise<ExchangeConnection[]> => {
      const { data, error } = await supabase
        .from("exchange_connections")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ExchangeConnection[];
    },
  });
}

export function useSyncRuns() {
  return useQuery({
    queryKey: ["exchange-sync-runs"],
    queryFn: async (): Promise<SyncRun[]> => {
      const { data, error } = await supabase
        .from("exchange_sync_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as SyncRun[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["exchange-connections"] });
    qc.invalidateQueries({ queryKey: ["exchange-sync-runs"] });
  };
}

export type ConnectInput = {
  exchange: string;
  label?: string;
  apiKey: string;
  apiSecret: string;
  passphrase?: string | null;
  scopes: string[];
  autoSync?: boolean;
};

export function useConnectExchange() {
  const fn = useServerFn(connectExchange);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: ConnectInput) => fn({ data: input as never }),
    onSuccess: invalidate,
  });
}

export function useDisconnectExchange() {
  const fn = useServerFn(disconnectExchange);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (connectionId: string) => fn({ data: { connectionId } }),
    onSuccess: invalidate,
  });
}

export function useUpdateExchangeSettings() {
  const fn = useServerFn(updateExchangeSettings);
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { connectionId: string; autoSync?: boolean; scopes?: string[] }) =>
      fn({ data: input as never }),
    onSuccess: invalidate,
  });
}

export function useSyncExchange() {
  const fn = useServerFn(syncExchange);
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectionId: string) => fn({ data: { connectionId } }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["trades"] });
    },
  });
}
