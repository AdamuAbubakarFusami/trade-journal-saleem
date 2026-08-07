CREATE TABLE public.exchange_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'disconnected',
  api_status text NOT NULL DEFAULT 'unknown',
  auto_sync boolean NOT NULL DEFAULT false,
  scopes text[] NOT NULL DEFAULT ARRAY['spot']::text[],
  last_sync_at timestamptz,
  last_sync_status text,
  imported_trades integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_connections TO authenticated;
GRANT ALL ON public.exchange_connections TO service_role;
ALTER TABLE public.exchange_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own exchange connections" ON public.exchange_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exchange connections" ON public.exchange_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exchange connections" ON public.exchange_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own exchange connections" ON public.exchange_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER update_exchange_connections_updated_at BEFORE UPDATE ON public.exchange_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.exchange_credentials (
  connection_id uuid PRIMARY KEY REFERENCES public.exchange_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enc_api_key text NOT NULL,
  enc_api_secret text NOT NULL,
  enc_passphrase text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.exchange_credentials TO service_role;
ALTER TABLE public.exchange_credentials ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_exchange_credentials_updated_at BEFORE UPDATE ON public.exchange_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.exchange_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.exchange_connections(id) ON DELETE CASCADE,
  exchange text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['spot']::text[],
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.exchange_sync_runs TO authenticated;
GRANT ALL ON public.exchange_sync_runs TO service_role;
ALTER TABLE public.exchange_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own sync runs" ON public.exchange_sync_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync runs" ON public.exchange_sync_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sync runs" ON public.exchange_sync_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_exchange_sync_runs_user_created ON public.exchange_sync_runs (user_id, created_at DESC);