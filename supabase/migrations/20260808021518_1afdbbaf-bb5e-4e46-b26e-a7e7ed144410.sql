CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chain text NOT NULL,
  address text NOT NULL,
  label text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'connected',
  native_balance numeric,
  native_symbol text,
  auto_sync boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  last_sync_status text,
  discovered_trades integer NOT NULL DEFAULT 0,
  imported_trades integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, chain, address)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallets" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallets" ON public.wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallets" ON public.wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallets" ON public.wallets FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wallet_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  chain text NOT NULL,
  tx_hash text NOT NULL,
  block_time timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'swap',
  direction text NOT NULL DEFAULT 'long',
  token_in text,
  token_out text,
  asset text NOT NULL DEFAULT '',
  amount_in numeric,
  amount_out numeric,
  price numeric,
  value_usd numeric,
  fee_usd numeric,
  status text NOT NULL DEFAULT 'pending',
  trade_id uuid REFERENCES public.trades(id) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, tx_hash)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_swaps TO authenticated;
GRANT ALL ON public.wallet_swaps TO service_role;
ALTER TABLE public.wallet_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallet swaps" ON public.wallet_swaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallet swaps" ON public.wallet_swaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own wallet swaps" ON public.wallet_swaps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallet swaps" ON public.wallet_swaps FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_wallet_swaps_updated_at BEFORE UPDATE ON public.wallet_swaps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX wallet_swaps_user_status_idx ON public.wallet_swaps (user_id, status, block_time DESC);

CREATE TABLE public.wallet_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  chain text NOT NULL,
  address text NOT NULL DEFAULT '',
  discovered_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.wallet_sync_runs TO authenticated;
GRANT ALL ON public.wallet_sync_runs TO service_role;
ALTER TABLE public.wallet_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallet sync runs" ON public.wallet_sync_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own wallet sync runs" ON public.wallet_sync_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own wallet sync runs" ON public.wallet_sync_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);