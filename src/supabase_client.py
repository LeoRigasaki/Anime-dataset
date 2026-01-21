"""
Supabase client wrapper for AnimeScheduleAgent
Handles all database operations for anime data
"""

import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


class SupabaseClient:
    """Wrapper for Supabase operations on anime data"""

    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")

        if not url or not key:
            raise ValueError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file.\n"
                "Get these from: Supabase Dashboard > Project Settings > API"
            )

        self.client: Client = create_client(url, key)
        self.current_year = datetime.now().year

    # =========================================================================
    # ANIME OPERATIONS
    # =========================================================================

    def upsert_anime(self, anime_data: Dict[str, Any]) -> Optional[Dict]:
        """
        Insert or update a single anime record.
        Uses anime_id as the unique key for upserts.
        """
        try:
            # Convert semicolon-separated strings to arrays for Supabase
            anime_data = self._convert_to_arrays(anime_data)

            result = self.client.table('animes').upsert(
                anime_data,
                on_conflict='anime_id'
            ).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error upserting anime {anime_data.get('anime_id')}: {e}")
            return None

    def upsert_anime_batch(self, anime_list: List[Dict[str, Any]], batch_size: int = 100) -> int:
        """
        Batch upsert multiple anime records.
        Returns count of successfully upserted records.
        """
        total_upserted = 0

        # Process in batches
        for i in range(0, len(anime_list), batch_size):
            batch = anime_list[i:i + batch_size]

            # Convert each record
            converted_batch = [self._convert_to_arrays(anime) for anime in batch]

            try:
                result = self.client.table('animes').upsert(
                    converted_batch,
                    on_conflict='anime_id'
                ).execute()

                total_upserted += len(result.data) if result.data else 0
                print(f"  Upserted batch {i // batch_size + 1}: {len(result.data)} records")
            except Exception as e:
                print(f"  Error upserting batch {i // batch_size + 1}: {e}")
                # Debug: print first record's keys and problematic values
                if converted_batch:
                    first = converted_batch[0]
                    print(f"    Debug - First record keys: {list(first.keys())}")
                    print(f"    Debug - anime_id: {first.get('anime_id')}, title: {first.get('title', '')[:30]}")
                    # Print timestamp fields
                    for field in ['collected_at', 'next_airing_episode_at', 'start_date', 'end_date']:
                        print(f"    Debug - {field}: {first.get(field)} (type: {type(first.get(field)).__name__})")

        return total_upserted

    def get_anime_by_id(self, anime_id: int) -> Optional[Dict]:
        """Get a single anime by AniList ID"""
        result = self.client.table('animes').select('*').eq('anime_id', anime_id).execute()
        return result.data[0] if result.data else None

    def get_seasonal_anime(
        self,
        year: int,
        season: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict]:
        """Get anime for a specific season"""
        result = self.client.table('animes')\
            .select('*')\
            .eq('season_year', year)\
            .eq('season', season)\
            .order('popularity', desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()

        return result.data or []

    def get_current_season_anime(self, limit: int = 100) -> List[Dict]:
        """Get anime from the current season"""
        month = datetime.now().month
        if month in [1, 2, 3]:
            season = 'WINTER'
        elif month in [4, 5, 6]:
            season = 'SPRING'
        elif month in [7, 8, 9]:
            season = 'SUMMER'
        else:
            season = 'FALL'

        return self.get_seasonal_anime(self.current_year, season, limit)

    def get_airing_anime(self, limit: int = 100) -> List[Dict]:
        """Get currently airing anime"""
        result = self.client.table('animes')\
            .select('*')\
            .eq('status', 'RELEASING')\
            .order('popularity', desc=True)\
            .limit(limit)\
            .execute()

        return result.data or []

    def search_anime(self, query: str, limit: int = 20) -> List[Dict]:
        """Search anime by title"""
        result = self.client.table('animes')\
            .select('*')\
            .or_(f"title.ilike.%{query}%,english_title.ilike.%{query}%")\
            .order('popularity', desc=True)\
            .limit(limit)\
            .execute()

        return result.data or []

    def get_anime_by_year(self, year: int, limit: int = 500) -> List[Dict]:
        """Get all anime from a specific year"""
        result = self.client.table('animes')\
            .select('*')\
            .eq('season_year', year)\
            .order('popularity', desc=True)\
            .limit(limit)\
            .execute()

        return result.data or []

    def get_anime_count_by_year(self, year: int) -> int:
        """Get count of anime for a specific year"""
        result = self.client.table('animes')\
            .select('anime_id', count='exact')\
            .eq('season_year', year)\
            .execute()

        return result.count or 0

    def delete_current_year_anime(self) -> int:
        """Delete all anime from current year (for re-sync)"""
        result = self.client.table('animes')\
            .delete()\
            .eq('season_year', self.current_year)\
            .execute()

        return len(result.data) if result.data else 0

    # =========================================================================
    # AIRING SCHEDULE OPERATIONS
    # =========================================================================

    def upsert_schedule(self, schedule_data: Dict[str, Any]) -> Optional[Dict]:
        """Upsert a single schedule entry"""
        try:
            result = self.client.table('airing_schedule').upsert(
                schedule_data,
                on_conflict='anime_id,episode'
            ).execute()

            return result.data[0] if result.data else None
        except Exception as e:
            print(f"Error upserting schedule: {e}")
            return None

    def get_schedule_for_date(self, date: datetime) -> List[Dict]:
        """Get all episodes airing on a specific date"""
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)

        result = self.client.table('airing_schedule')\
            .select('*, animes(*)')\
            .gte('airing_at', start_of_day.isoformat())\
            .lte('airing_at', end_of_day.isoformat())\
            .order('airing_at')\
            .execute()

        return result.data or []

    def get_weekly_schedule(self, start_date: datetime) -> List[Dict]:
        """Get schedule for a week starting from the given date"""
        from datetime import timedelta
        end_date = start_date + timedelta(days=7)

        result = self.client.table('airing_schedule')\
            .select('*, animes(*)')\
            .gte('airing_at', start_date.isoformat())\
            .lt('airing_at', end_date.isoformat())\
            .order('airing_at')\
            .execute()

        return result.data or []

    def clear_old_schedule(self, before_date: datetime) -> int:
        """Clear schedule entries older than the given date"""
        result = self.client.table('airing_schedule')\
            .delete()\
            .lt('airing_at', before_date.isoformat())\
            .execute()

        return len(result.data) if result.data else 0

    # =========================================================================
    # SEASON ARCHIVE OPERATIONS
    # =========================================================================

    def archive_season(self, year: int, season: str) -> Optional[Dict]:
        """Create or update a season archive entry"""
        # Get all anime for this season
        anime_list = self.get_seasonal_anime(year, season, limit=1000)

        if not anime_list:
            return None

        anime_ids = [a['anime_id'] for a in anime_list]
        top_anime_ids = [a['anime_id'] for a in anime_list[:10]]
        total_members = sum(a.get('members', 0) or 0 for a in anime_list)
        scores = [a['score'] for a in anime_list if a.get('score')]
        avg_score = sum(scores) / len(scores) if scores else None

        archive_data = {
            'season': season,
            'year': year,
            'anime_count': len(anime_list),
            'anime_ids': anime_ids,
            'top_anime_ids': top_anime_ids,
            'total_members': total_members,
            'avg_score': avg_score
        }

        result = self.client.table('season_archive').upsert(
            archive_data,
            on_conflict='season,year'
        ).execute()

        return result.data[0] if result.data else None

    def get_season_archive(self, year: int, season: str) -> Optional[Dict]:
        """Get archived season data"""
        result = self.client.table('season_archive')\
            .select('*')\
            .eq('year', year)\
            .eq('season', season)\
            .execute()

        return result.data[0] if result.data else None

    # =========================================================================
    # SYNC LOG OPERATIONS
    # =========================================================================

    def start_sync_log(self, sync_type: str) -> int:
        """Start a new sync log entry, returns the log ID"""
        result = self.client.table('sync_log').insert({
            'sync_type': sync_type,
            'started_at': datetime.utcnow().isoformat(),
            'status': 'running'
        }).execute()

        return result.data[0]['id'] if result.data else 0

    def complete_sync_log(
        self,
        log_id: int,
        records_processed: int,
        records_inserted: int,
        records_updated: int,
        error_message: str = None
    ):
        """Complete a sync log entry"""
        status = 'failed' if error_message else 'completed'

        self.client.table('sync_log').update({
            'completed_at': datetime.utcnow().isoformat(),
            'status': status,
            'records_processed': records_processed,
            'records_inserted': records_inserted,
            'records_updated': records_updated,
            'error_message': error_message
        }).eq('id', log_id).execute()

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    def _convert_to_arrays(self, anime_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert semicolon-separated strings to arrays for PostgreSQL"""
        array_fields = [
            'studios', 'main_studios', 'genres', 'tags',
            'main_characters', 'main_staff', 'streaming_sites', 'synonyms'
        ]

        converted = anime_data.copy()

        # Remove updated_at from incoming data - let the database trigger handle it
        # The API sends it as a Unix timestamp, but we use the DB's auto-update
        if 'updated_at' in converted:
            del converted['updated_at']

        # Fix season field - AniList returns "WINTER 2024" format, we need just "WINTER"
        if 'season' in converted and isinstance(converted['season'], str):
            season_parts = converted['season'].split()
            if season_parts and season_parts[0] in ['WINTER', 'SPRING', 'SUMMER', 'FALL']:
                converted['season'] = season_parts[0]

        # Handle collected_at - ensure it's a proper timestamp string
        if 'collected_at' in converted:
            val = converted['collected_at']
            if isinstance(val, (int, float)):
                # Convert Unix timestamp to ISO format
                converted['collected_at'] = datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
            elif not val:
                converted['collected_at'] = datetime.now(timezone.utc).isoformat()

        # Handle next_airing_episode_at - ensure it's an integer, set to 0 if invalid
        if 'next_airing_episode_at' in converted:
            val = converted['next_airing_episode_at']
            if val is None or val == '':
                converted['next_airing_episode_at'] = 0
            elif not isinstance(val, int):
                try:
                    converted['next_airing_episode_at'] = int(val)
                except (ValueError, TypeError):
                    converted['next_airing_episode_at'] = 0

        # Convert empty strings to None for date fields (PostgreSQL rejects "")
        date_fields = ['start_date', 'end_date']
        for field in date_fields:
            if field in converted and converted[field] == '':
                converted[field] = None

        # Convert empty strings to None for optional text fields
        text_fields = ['english_title', 'japanese_title', 'user_preferred_title', 'source',
                       'broadcast_day', 'broadcast_time', 'synopsis', 'hashtag',
                       'cover_image_large', 'cover_image_color', 'banner_image',
                       'trailer_site', 'trailer_id', 'site_url', 'country_of_origin', 'rating']
        for field in text_fields:
            if field in converted and converted[field] == '':
                converted[field] = None

        for field in array_fields:
            if field in converted and isinstance(converted[field], str):
                # Split by semicolon and filter empty strings
                converted[field] = [
                    s.strip() for s in converted[field].split(';')
                    if s.strip()
                ] if converted[field] else []

        # Convert date strings to proper format
        date_fields = ['start_date', 'end_date']
        for field in date_fields:
            if field in converted and converted[field]:
                try:
                    # Ensure it's a valid date string
                    if isinstance(converted[field], str) and converted[field]:
                        datetime.strptime(converted[field], '%Y-%m-%d')
                except ValueError:
                    converted[field] = None

        # Handle boolean fields
        bool_fields = ['is_adult', 'is_licensed']
        for field in bool_fields:
            if field in converted:
                if isinstance(converted[field], str):
                    converted[field] = converted[field].lower() in ('true', '1', 'yes')

        return converted

    def health_check(self) -> bool:
        """Check if Supabase connection is working"""
        try:
            result = self.client.table('animes').select('anime_id').limit(1).execute()
            return True
        except Exception as e:
            print(f"Supabase health check failed: {e}")
            return False


# Singleton instance
_supabase_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    """Get or create the Supabase client singleton"""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client
