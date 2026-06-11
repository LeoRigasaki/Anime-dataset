-- ============================================================================
-- DATASET VERSIONING
-- Keep the currently active dataset visible while a new snapshot is loading.
-- ============================================================================

CREATE TABLE IF NOT EXISTS dataset_versions (
    id BIGSERIAL PRIMARY KEY,
    version_name TEXT UNIQUE NOT NULL,
    source_file TEXT,
    status TEXT NOT NULL DEFAULT 'loading',
    window_start_year INTEGER DEFAULT 2026,
    window_end_year INTEGER DEFAULT 2029,
    records_expected INTEGER DEFAULT 0,
    records_loaded INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    error_message TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE animes
    ADD COLUMN IF NOT EXISTS dataset_version_id BIGINT REFERENCES dataset_versions(id);

ALTER TABLE airing_schedule
    ADD COLUMN IF NOT EXISTS dataset_version_id BIGINT REFERENCES dataset_versions(id);

ALTER TABLE season_archive
    ADD COLUMN IF NOT EXISTS dataset_version_id BIGINT REFERENCES dataset_versions(id);

ALTER TABLE sync_log
    ADD COLUMN IF NOT EXISTS csv_source TEXT,
    ADD COLUMN IF NOT EXISTS season_year INTEGER,
    ADD COLUMN IF NOT EXISTS new_records INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_records INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

INSERT INTO dataset_versions (
    id,
    version_name,
    source_file,
    status,
    window_start_year,
    window_end_year,
    records_loaded,
    completed_at,
    activated_at,
    details
)
SELECT
    1,
    'legacy-live',
    'pre-versioning',
    'active',
    2026,
    2029,
    (SELECT COUNT(*) FROM animes),
    NOW(),
    NOW(),
    jsonb_build_object('note', 'Backfilled from existing animes table')
WHERE NOT EXISTS (
    SELECT 1
    FROM dataset_versions
);

SELECT setval(
    pg_get_serial_sequence('dataset_versions', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM dataset_versions), 1),
    true
);

UPDATE animes
SET dataset_version_id = (
    SELECT id
    FROM dataset_versions
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, id DESC
    LIMIT 1
)
WHERE dataset_version_id IS NULL;

UPDATE airing_schedule
SET dataset_version_id = (
    SELECT id
    FROM dataset_versions
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, id DESC
    LIMIT 1
)
WHERE dataset_version_id IS NULL;

UPDATE season_archive
SET dataset_version_id = (
    SELECT id
    FROM dataset_versions
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, id DESC
    LIMIT 1
)
WHERE dataset_version_id IS NULL;

ALTER TABLE animes
    ALTER COLUMN dataset_version_id SET NOT NULL;

ALTER TABLE airing_schedule
    ALTER COLUMN dataset_version_id SET NOT NULL;

ALTER TABLE season_archive
    ALTER COLUMN dataset_version_id SET NOT NULL;

ALTER TABLE animes
    DROP CONSTRAINT IF EXISTS animes_anime_id_key;

ALTER TABLE airing_schedule
    DROP CONSTRAINT IF EXISTS airing_schedule_schedule_id_key;

ALTER TABLE airing_schedule
    DROP CONSTRAINT IF EXISTS airing_schedule_anime_id_episode_key;

ALTER TABLE season_archive
    DROP CONSTRAINT IF EXISTS season_archive_season_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_animes_version_anime_id
    ON animes(dataset_version_id, anime_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_airing_schedule_version_schedule_id
    ON airing_schedule(dataset_version_id, schedule_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_airing_schedule_version_anime_episode
    ON airing_schedule(dataset_version_id, anime_id, episode);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_archive_version_season_year
    ON season_archive(dataset_version_id, season, year);

CREATE INDEX IF NOT EXISTS idx_animes_dataset_version_year
    ON animes(dataset_version_id, season_year, season);

CREATE INDEX IF NOT EXISTS idx_airing_schedule_dataset_version_airing_at
    ON airing_schedule(dataset_version_id, airing_at);

CREATE OR REPLACE FUNCTION public.get_active_dataset_version_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
    SELECT id
    FROM public.dataset_versions
    WHERE status = 'active'
    ORDER BY activated_at DESC NULLS LAST, completed_at DESC NULLS LAST, id DESC
    LIMIT 1;
$$;

CREATE OR REPLACE VIEW public.animes_active AS
SELECT a.*
FROM public.animes AS a
WHERE a.dataset_version_id = public.get_active_dataset_version_id();

CREATE OR REPLACE VIEW public.airing_schedule_active AS
SELECT s.*
FROM public.airing_schedule AS s
WHERE s.dataset_version_id = public.get_active_dataset_version_id();

CREATE OR REPLACE FUNCTION public.activate_dataset_version(new_version_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.dataset_versions
    SET status = 'archived'
    WHERE status = 'active'
      AND id <> new_version_id;

    UPDATE public.dataset_versions
    SET
        status = 'active',
        completed_at = COALESCE(completed_at, NOW()),
        activated_at = NOW()
    WHERE id = new_version_id;
END;
$$;
