-- ============================================================================
-- PRESERVE HISTORICAL ARCHIVE IN ACTIVE VIEW
-- The daily sync only loads the featured window (2026-2029), so each new
-- dataset version contains ~700 rows. Without this change, activating the
-- first versioned sync would hide the 14k historical rows that live under
-- the 'legacy-live' version (id = 1), breaking Archive-year browsing.
--
-- animes_active now serves:
--   * the active dataset version for years inside its featured window
--   * the legacy archive (version 1) for years outside that window
-- ============================================================================

CREATE OR REPLACE VIEW public.animes_active AS
SELECT a.*
FROM public.animes AS a
JOIN public.dataset_versions AS v
    ON v.id = public.get_active_dataset_version_id()
WHERE a.dataset_version_id = v.id
   OR (
        v.id <> 1
        AND a.dataset_version_id = 1
        AND (
            a.season_year IS NULL
            OR a.season_year < v.window_start_year
            OR a.season_year > v.window_end_year
        )
   );
