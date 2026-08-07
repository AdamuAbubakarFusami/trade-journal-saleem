import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXCHANGES, SCOPES } from "./exchange";

const ExchangeEnum = z.enum(EXCHANGES);
const ScopeArray = z.array(z.enum(SCOPES)).min(1).max(4);

const ConnectSchema = z.object({
  exchange: ExchangeEnum,
  label: z.string().max(60).optional().default(""),
  apiKey: z.string().min(8).max(300),
  apiSecret: z.string().min(8).max(300),
  passphrase: z.string().max(200).optional().nullable(),
  scopes: ScopeArray,
  autoSync: z.boolean().optional().default(false),
});

export const connectExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { verifyCredentials, storeCredentials } = await import("./exchange-sync.server");
    const creds = {
      apiKey: data.apiKey.trim(),
      apiSecret: data.apiSecret.trim(),
      passphrase: data.passphrase?.trim() || null,
    };
    const check = await verifyCredentials(data.exchange, creds);
    if (!check.ok) return { ok: false as const, message: check.message };

    const { data: row, error } = await context.supabase
      .from("exchange_connections")
      .upsert(
        {
          user_id: context.userId,
          exchange: data.exchange,
          label: data.label ?? "",
          status: "connected",
          api_status: "operational",
          auto_sync: data.autoSync ?? false,
          scopes: data.scopes,
        } as never,
        { onConflict: "user_id,exchange" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await storeCredentials((row as { id: string }).id, context.userId, creds);
    return { ok: true as const, message: check.message, id: (row as { id: string }).id };
  });

export const disconnectExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("exchange_connections")
      .delete()
      .eq("id", data.connectionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateExchangeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        autoSync: z.boolean().optional(),
        scopes: ScopeArray.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.autoSync !== undefined) patch["auto_sync"] = data.autoSync;
    if (data.scopes) patch["scopes"] = data.scopes;
    const { error } = await context.supabase
      .from("exchange_connections")
      .update(patch as never)
      .eq("id", data.connectionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const syncExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: conn, error } = await context.supabase
      .from("exchange_connections")
      .select("id, exchange, scopes")
      .eq("id", data.connectionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conn) throw new Error("Connection not found");

    const parsed = z
      .object({ id: z.string(), exchange: ExchangeEnum, scopes: ScopeArray })
      .parse(conn);

    const { runSync } = await import("./exchange-sync.server");
    return runSync({
      userId: context.userId,
      connectionId: parsed.id,
      exchange: parsed.exchange,
      scopes: parsed.scopes,
    });
  });
