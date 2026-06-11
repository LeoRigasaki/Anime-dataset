-- ============================================================================
-- ROW LEVEL SECURITY
-- Apps access Supabase server-side with the service key (bypasses RLS).
-- The anon key gets read-only access to catalog tables and nothing else:
-- no public policies on sync_log / dataset_versions means service-key only.
-- ============================================================================

ALTER TABLE public.animes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airing_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read" ON public.animes
    FOR SELECT USING (true);

CREATE POLICY "public read" ON public.airing_schedule
    FOR SELECT USING (true);

CREATE POLICY "public read" ON public.season_archive
    FOR SELECT USING (true);

-- Pin search_path so these SECURITY-relevant functions can't be hijacked
-- by objects in other schemas (Supabase linter 0011)
ALTER FUNCTION public.get_distinct_genres() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.get_active_dataset_version_id() SET search_path = public;
ALTER FUNCTION public.activate_dataset_version(BIGINT) SET search_path = public;
