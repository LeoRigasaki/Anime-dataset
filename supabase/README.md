# Supabase Integration for AnimeScheduleAgent

This directory contains the Supabase database setup and migration scripts for storing all anime data from 1970 to present.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AniList API ──┐                                            │
│                │                                            │
│                ▼                                            │
│         ┌──────────────┐                                    │
│         │   Migration  │ ◄── One-time: 1970 to last year   │
│         │    Script    │ ◄── Daily: Current year sync      │
│         └──────┬───────┘                                    │
│                │                                            │
│                ▼                                            │
│         ┌──────────────┐                                    │
│         │   SUPABASE   │                                    │
│         │   DATABASE   │                                    │
│         │              │                                    │
│         │  • animes    │ ◄── All anime (1970-present)      │
│         │  • schedule  │ ◄── Current airing times          │
│         │  • archive   │ ◄── Season summaries              │
│         └──────┬───────┘                                    │
│                │                                            │
│                ▼                                            │
│         ┌──────────────┐                                    │
│         │  FastAPI     │                                    │
│         │  Backend     │                                    │
│         └──────┬───────┘                                    │
│                │                                            │
│                ▼                                            │
│         ┌──────────────┐                                    │
│         │   Next.js    │                                    │
│         │   Frontend   │                                    │
│         └──────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note down your project URL and keys

### 2. Add Environment Variables

Add these to your `.env` file:

```env
# Supabase credentials - Get from: Supabase Dashboard > Project Settings > API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### 3. Run the Database Migration

In the Supabase Dashboard:
1. Go to **SQL Editor**
2. Copy the contents of `migrations/001_create_anime_tables.sql`
3. Run the SQL to create tables

Or use the Supabase CLI:
```bash
supabase db push
```

### 4. Load Historical Data

```bash
# Install dependencies
pip install -r requirements.txt

# Run full historical migration (1970 to last year)
# WARNING: This takes several hours due to API rate limits
python src/supabase_migrate.py --full --start-year 1970

# Or start from a more recent year for faster testing
python src/supabase_migrate.py --full --start-year 2020
```

### 5. Set Up Daily Sync (Current Year)

The current year data should be synced regularly to stay up-to-date:

```bash
# Sync current year (run daily via cron)
python src/supabase_migrate.py --current-year
```

Example cron job (runs daily at 4 AM):
```cron
0 4 * * * cd /path/to/Anime-dataset && python src/supabase_migrate.py --current-year
```

## Database Schema

### animes
Main table storing all anime data:
- `anime_id` - AniList ID (unique)
- `mal_id` - MyAnimeList ID
- `title`, `english_title`, `japanese_title` - Various titles
- `type` - TV, MOVIE, OVA, ONA, SPECIAL, MUSIC
- `status` - RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED, HIATUS
- `season`, `season_year` - Season info
- `genres[]`, `tags[]` - Arrays for easy filtering
- `score`, `popularity`, `members`, `favorites` - Engagement metrics
- And more...

### airing_schedule
Ephemeral table for episode air times:
- Only contains current/future episodes
- Linked to animes table via `anime_id`
- Cleaned up automatically after episodes air

### season_archive
Summary of completed seasons:
- Quick access to historical season data
- Total anime count, average scores, top anime

### sync_log
Tracks all data synchronization operations:
- Useful for debugging and monitoring

## CLI Commands

```bash
# Full historical migration
python src/supabase_migrate.py --full --start-year 1970

# Sync only current year
python src/supabase_migrate.py --current-year

# Sync a specific year
python src/supabase_migrate.py --year 2023

# View database statistics
python src/supabase_migrate.py --stats
```

## API Integration

The API automatically uses Supabase if configured, with fallback to CSV files:

```python
# In your code
from src.supabase_tools import get_season_anime, search_anime, get_weekly_schedule

# These functions automatically use Supabase if SUPABASE_URL is set
anime_list = get_season_anime("WINTER", 2025)
anime = search_anime("Solo Leveling")
schedule = get_weekly_schedule(weeks_offset=0)
```

## Data Update Strategy

| Data Type | Update Frequency | Notes |
|-----------|-----------------|-------|
| Historical (pre-2024) | Never | Immutable after initial load |
| Last Year | Yearly | Update once when year ends |
| Current Year | Daily | All 4 seasons updated together |
| Airing Schedule | Every 6 hours | Only current/upcoming episodes |

## Benefits Over CSV Approach

1. **Fast queries** - Indexed database vs. file scanning
2. **Historical access** - Query any year from 1970+
3. **Scalability** - Handles 50+ years of data
4. **Real-time** - Supabase subscriptions for live updates
5. **Search** - Full-text search across all anime
6. **Reliability** - No API rate limits for reads
