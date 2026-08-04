import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Mapping, Platform } from "@/lib/csv-import";

export type ImportBatch = {
  id: string;
  platform: string;
  file_name: string;
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  error_count: number;
  duration_ms: number;
  status: string;
  log: unknown;
  created_at: string;
};

export function useImportBatches() {
  return useQuery({
    queryKey: ["import-batches"],
    queryFn: async (): Promise<ImportBatch[]> => {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ImportBatch[];
    },
  });
}

export function useDeleteImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("import_batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import-batches"] }),
  });
}

export type SavedMapping = { platform: string; mapping: Mapping };

export function useSavedMappings() {
  return useQuery({
    queryKey: ["import-mappings"],
    queryFn: async (): Promise<SavedMapping[]> => {
      const { data, error } = await supabase.from("import_mappings").select("platform, mapping");
      if (error) throw error;
      return (data ?? []) as unknown as SavedMapping[];
    },
  });
}

export function useSaveMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ platform, mapping }: { platform: Platform; mapping: Mapping }) => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("import_mappings")
        .upsert(
          { user_id: user.id, platform, mapping: mapping as never },
          { onConflict: "user_id,platform" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import-mappings"] }),
  });
}
