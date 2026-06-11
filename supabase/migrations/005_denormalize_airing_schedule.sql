-- ============================================================================
-- DENORMALIZED AIRING SCHEDULE
-- The schedule tab only needs display fields; storing them on the schedule
-- row avoids joining animes (no FK relationship since versioning dropped the
-- anime_id unique constraint) and keeps schedule rows self-contained even for
-- shows outside the featured sync window (e.g. long-running 2025 anime).
-- ============================================================================

ALTER TABLE public.airing_schedule
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS cover_image TEXT,
    ADD COLUMN IF NOT EXISTS score NUMERIC,
    ADD COLUMN IF NOT EXISTS total_episodes INTEGER,
    ADD COLUMN IF NOT EXISTS anime_status TEXT;

-- Recreate the view: it snapshotted the column list before the new columns
CREATE OR REPLACE VIEW public.airing_schedule_active AS
SELECT s.*
FROM public.airing_schedule AS s
WHERE s.dataset_version_id = public.get_active_dataset_version_id();
