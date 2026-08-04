CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'generic',
  file_name text NOT NULL DEFAULT 'import.csv',
  total_rows integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own import batches" ON public.import_batches FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import batches" ON public.import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import batches" ON public.import_batches FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own import batches" ON public.import_batches FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_import_batches_updated_at BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mappings TO authenticated;
GRANT ALL ON public.import_mappings TO service_role;
ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own import mappings" ON public.import_mappings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import mappings" ON public.import_mappings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import mappings" ON public.import_mappings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own import mappings" ON public.import_mappings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_import_mappings_updated_at BEFORE UPDATE ON public.import_mappings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();