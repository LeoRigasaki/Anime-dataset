-- ============================================================================
-- VIEW SECURITY INVOKER
-- The *_active views defaulted to definer semantics (Supabase linter 0010),
-- which would let them bypass table RLS. With invoker semantics the querying
-- role's RLS applies; dataset_versions needs a read policy so
-- get_active_dataset_version_id() still resolves for the anon role.
-- ============================================================================

ALTER VIEW public.animes_active SET (security_invoker = true);
ALTER VIEW public.airing_schedule_active SET (security_invoker = true);

CREATE POLICY "public read" ON public.dataset_versions
    FOR SELECT USING (true);
