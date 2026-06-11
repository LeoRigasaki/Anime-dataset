-- ============================================================================
-- ADULT FLAG ON AIRING SCHEDULE
-- AniList airing schedules include adult media; the schedule UI must be able
-- to filter them out. Backfill existing rows to FALSE (re-synced daily with
-- the real flag from AniList).
-- ============================================================================

ALTER TABLE public.airing_schedule
    ADD COLUMN IF NOT EXISTS is_adult BOOLEAN DEFAULT FALSE;

UPDATE public.airing_schedule SET is_adult = FALSE WHERE is_adult IS NULL;

-- Recreate the view to pick up the new column
CREATE OR REPLACE VIEW public.airing_schedule_active AS
SELECT s.*
FROM public.airing_schedule AS s
WHERE s.dataset_version_id = public.get_active_dataset_version_id();

ALTER VIEW public.airing_schedule_active SET (security_invoker = true);
