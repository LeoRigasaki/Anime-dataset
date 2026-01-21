-- ============================================================================
-- ANIME DATABASE SCHEMA FOR SUPABASE
-- Stores all anime data from 1970 to present
-- Only current year's data gets updated; historical data is immutable
-- ============================================================================

-- ============================================================================
-- MAIN ANIME TABLE
-- Core anime information - matches the CSV structure from anilist_api.py
-- ============================================================================
CREATE TABLE IF NOT EXISTS animes (
    -- Primary identifiers
    id BIGSERIAL PRIMARY KEY,
    anime_id BIGINT UNIQUE NOT NULL,           -- AniList ID
    mal_id BIGINT,                              -- MyAnimeList ID

    -- Titles
    title TEXT NOT NULL,                        -- Romaji title
    english_title TEXT,
    japanese_title TEXT,
    user_preferred_title TEXT,
    synonyms TEXT[],                            -- Alternative names

    -- Basic info
    type TEXT,                                  -- TV, MOVIE, OVA, ONA, SPECIAL, MUSIC
    episodes INTEGER,
    duration INTEGER,                           -- Episode duration in minutes
    status TEXT,                                -- RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED, HIATUS
    source TEXT,                                -- MANGA, LIGHT_NOVEL, ORIGINAL, etc.

    -- Season info
    season TEXT,                                -- WINTER, SPRING, SUMMER, FALL
    season_year INTEGER,

    -- Production
    studios TEXT[],
    main_studios TEXT[],

    -- Classification
    genres TEXT[],
    tags TEXT[],
    is_adult BOOLEAN DEFAULT FALSE,
    country_of_origin TEXT,
    is_licensed BOOLEAN DEFAULT TRUE,

    -- Classification/Rating
    rating TEXT,                                -- Age rating (if available)

    -- Scores and rankings
    score DECIMAL(5,2),                         -- Average score (0-100)
    mean_score DECIMAL(5,2),
    scored_by INTEGER DEFAULT 0,
    rank INTEGER,                               -- Overall ranking
    popularity INTEGER,
    popularity_rank INTEGER,

    -- User engagement statistics
    members INTEGER DEFAULT 0,
    favorites INTEGER DEFAULT 0,
    watching INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    on_hold INTEGER DEFAULT 0,
    dropped INTEGER DEFAULT 0,
    plan_to_watch INTEGER DEFAULT 0,

    -- Dates
    start_date DATE,
    end_date DATE,
    broadcast_day TEXT,
    broadcast_time TEXT,

    -- Content
    synopsis TEXT,
    hashtag TEXT,

    -- Media
    cover_image_large TEXT,
    cover_image_color TEXT,
    banner_image TEXT,
    trailer_site TEXT,
    trailer_id TEXT,

    -- Credits (stored as arrays for easier querying)
    main_characters TEXT[],
    main_staff TEXT[],
    streaming_sites TEXT[],

    -- External links
    site_url TEXT,

    -- Airing info (for currently releasing anime)
    next_airing_episode_at BIGINT,             -- Unix timestamp
    next_episode_number INTEGER,

    -- Metadata
    data_source TEXT DEFAULT 'anilist',
    collected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AIRING SCHEDULE TABLE
-- Ephemeral table for episode air times (current/upcoming only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS airing_schedule (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT UNIQUE,                  -- AniList schedule ID
    anime_id BIGINT NOT NULL,
    episode INTEGER NOT NULL,
    airing_at TIMESTAMPTZ NOT NULL,
    time_until_airing INTEGER,                  -- Seconds until airing

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(anime_id, episode)
);

-- ============================================================================
-- SEASON ARCHIVE TABLE
-- Immutable record of what anime aired in each season
-- ============================================================================
CREATE TABLE IF NOT EXISTS season_archive (
    id BIGSERIAL PRIMARY KEY,
    season TEXT NOT NULL,                       -- WINTER, SPRING, SUMMER, FALL
    year INTEGER NOT NULL,
    anime_count INTEGER DEFAULT 0,
    anime_ids BIGINT[],                         -- Array of anime_id values
    top_anime_ids BIGINT[],                     -- Top 10 by popularity

    -- Summary stats for this season
    total_members BIGINT DEFAULT 0,
    avg_score DECIMAL(5,2),

    archived_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(season, year)
);

-- ============================================================================
-- SYNC LOG TABLE
-- Track data synchronization history
-- ============================================================================
CREATE TABLE IF NOT EXISTS sync_log (
    id BIGSERIAL PRIMARY KEY,
    sync_type TEXT NOT NULL,                    -- 'full', 'current_year', 'schedule'
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running',              -- 'running', 'completed', 'failed'
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    error_message TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_animes_anime_id ON animes(anime_id);
CREATE INDEX IF NOT EXISTS idx_animes_mal_id ON animes(mal_id);
CREATE INDEX IF NOT EXISTS idx_animes_season_year ON animes(season_year, season);
CREATE INDEX IF NOT EXISTS idx_animes_status ON animes(status);
CREATE INDEX IF NOT EXISTS idx_animes_score ON animes(score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_animes_popularity ON animes(popularity DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_animes_genres ON animes USING gin(genres);
CREATE INDEX IF NOT EXISTS idx_animes_type ON animes(type);
CREATE INDEX IF NOT EXISTS idx_animes_is_adult ON animes(is_adult);

CREATE INDEX IF NOT EXISTS idx_airing_schedule_anime_id ON airing_schedule(anime_id);
CREATE INDEX IF NOT EXISTS idx_airing_schedule_airing_at ON airing_schedule(airing_at);

CREATE INDEX IF NOT EXISTS idx_season_archive_year ON season_archive(year);

-- ============================================================================
-- AUTO-UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_animes_updated_at ON animes;
CREATE TRIGGER update_animes_updated_at
    BEFORE UPDATE ON animes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
