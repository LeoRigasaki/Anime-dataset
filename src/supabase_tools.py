"""
Supabase-backed tools for AnimeScheduleAgent
Provides the same interface as tools.py but uses Supabase instead of CSV files
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from collections import defaultdict

from src.supabase_client import get_supabase_client, SupabaseClient


def _is_supabase_available() -> bool:
    """Check if Supabase is configured"""
    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_KEY"))


def get_supabase() -> Optional[SupabaseClient]:
    """Get Supabase client if available"""
    if _is_supabase_available():
        try:
            return get_supabase_client()
        except Exception as e:
            print(f"Failed to initialize Supabase: {e}")
    return None


# =============================================================================
# SEASON ANIME FUNCTIONS (matching tools.py interface)
# =============================================================================

def get_season_anime_supabase(
    season: str,
    year: int,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get all anime from a season using Supabase.
    Returns the same format as get_season_anime() in tools.py
    """
    client = get_supabase()
    if not client:
        return []

    anime_list = client.get_seasonal_anime(year, season, limit)

    # Transform to match tools.py format
    result = []
    for anime in anime_list:
        result.append({
            'anime_id': anime.get('anime_id'),
            'title': anime.get('title'),
            'english_title': anime.get('english_title'),
            'status': anime.get('status'),
            'episodes': anime.get('episodes'),
            'score': anime.get('score'),
            'popularity': anime.get('popularity'),
            'genres': anime.get('genres', []),
            'studios': anime.get('main_studios', []),
            'cover_image': anime.get('cover_image_large'),
            'synopsis': anime.get('synopsis'),
            'is_adult': anime.get('is_adult', False),
            'start_date': str(anime.get('start_date', '')),
            'end_date': str(anime.get('end_date', '')),
            'predicted_completion': str(anime.get('end_date', '')) if anime.get('end_date') else None,
            'current_episode': anime.get('next_episode_number', 0) - 1 if anime.get('next_episode_number') else anime.get('episodes'),
            'members': anime.get('members', 0),
            'favorites': anime.get('favorites', 0),
        })

    return result


def search_anime_supabase(query: str, limit: int = 20) -> Optional[Dict[str, Any]]:
    """
    Search for an anime by title using Supabase.
    Returns the same format as search_anime() in tools.py
    """
    client = get_supabase()
    if not client:
        return None

    results = client.search_anime(query, limit=1)

    if not results:
        return None

    anime = results[0]

    return {
        'anime_id': anime.get('anime_id'),
        'title': anime.get('title'),
        'english_title': anime.get('english_title'),
        'status': anime.get('status'),
        'episodes': anime.get('episodes'),
        'score': anime.get('score'),
        'popularity': anime.get('popularity'),
        'genres': anime.get('genres', []),
        'studios': anime.get('main_studios', []),
        'cover_image': anime.get('cover_image_large'),
        'synopsis': anime.get('synopsis'),
        'is_adult': anime.get('is_adult', False),
        'start_date': str(anime.get('start_date', '')),
        'end_date': str(anime.get('end_date', '')),
        'predicted_completion': str(anime.get('end_date', '')) if anime.get('end_date') else None,
    }


def search_anime_list_supabase(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search for anime and return multiple results.
    """
    client = get_supabase()
    if not client:
        return []

    results = client.search_anime(query, limit=limit)

    anime_list = []
    for anime in results:
        anime_list.append({
            'anime_id': anime.get('anime_id'),
            'title': anime.get('title'),
            'english_title': anime.get('english_title'),
            'status': anime.get('status'),
            'episodes': anime.get('episodes'),
            'score': anime.get('score'),
            'cover_image': anime.get('cover_image_large'),
            'genres': anime.get('genres', []),
            'is_adult': anime.get('is_adult', False),
        })

    return anime_list


# =============================================================================
# AIRING SCHEDULE FUNCTIONS (matching tools.py interface)
# =============================================================================

def get_weekly_schedule_supabase(weeks_offset: int = 0) -> Dict[str, Any]:
    """
    Get weekly airing schedule using Supabase.
    Returns the same format as get_weekly_schedule() in tools.py
    """
    client = get_supabase()
    if not client:
        return {
            'week_start': '',
            'week_end': '',
            'week_label': 'No schedule available',
            'total_schedules': 0,
            'schedule': {},
            'days_with_anime': []
        }

    # Calculate week start/end
    now = datetime.now()
    start_of_week = now - timedelta(days=now.weekday())  # Monday
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = start_of_week + timedelta(weeks=weeks_offset)
    end_of_week = start_of_week + timedelta(days=7)

    # Get schedule from Supabase
    schedule_items = client.get_weekly_schedule(start_of_week)

    # Group by day
    schedule_by_day = defaultdict(list)
    for item in schedule_items:
        airing_at = datetime.fromisoformat(item['airing_at'].replace('Z', '+00:00'))
        day_name = airing_at.strftime('%A').upper()

        anime = item.get('animes', {})
        schedule_item = {
            'schedule_id': item.get('id'),
            'anime_id': item.get('anime_id'),
            'title': anime.get('title', 'Unknown'),
            'episode': item.get('episode'),
            'airing_at': int(airing_at.timestamp()),
            'airing_time': airing_at.strftime('%I:%M %p'),
            'airing_date': airing_at.strftime('%Y-%m-%d'),
            'cover_image': anime.get('cover_image_large'),
            'status': anime.get('status'),
            'total_episodes': anime.get('episodes'),
            'score': anime.get('score'),
            'time_until_airing': int((airing_at - datetime.now(timezone.utc)).total_seconds()),
            'airing_status': _get_airing_status(airing_at),
            'airs_in_human': _format_time_until(airing_at)
        }
        schedule_by_day[day_name].append(schedule_item)

    # Sort each day's items by time
    for day in schedule_by_day:
        schedule_by_day[day].sort(key=lambda x: x['airing_at'])

    # Format week label
    if weeks_offset == 0:
        week_label = "This Week"
    elif weeks_offset == 1:
        week_label = "Next Week"
    elif weeks_offset == -1:
        week_label = "Last Week"
    else:
        week_label = f"Week of {start_of_week.strftime('%B %d')}"

    total_schedules = sum(len(items) for items in schedule_by_day.values())

    return {
        'week_start': start_of_week.strftime('%Y-%m-%d'),
        'week_end': end_of_week.strftime('%Y-%m-%d'),
        'week_label': week_label,
        'total_schedules': total_schedules,
        'schedule': dict(schedule_by_day),
        'days_with_anime': list(schedule_by_day.keys())
    }


def get_episodes_airing_on_date_supabase(date_str: str) -> List[Dict[str, Any]]:
    """
    Get episodes airing on a specific date.
    """
    client = get_supabase()
    if not client:
        return []

    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        return []

    schedule_items = client.get_schedule_for_date(target_date)

    episodes = []
    for item in schedule_items:
        airing_at = datetime.fromisoformat(item['airing_at'].replace('Z', '+00:00'))
        anime = item.get('animes', {})

        episodes.append({
            'anime_id': item.get('anime_id'),
            'title': anime.get('title', 'Unknown'),
            'episode': item.get('episode'),
            'airing_at': int(airing_at.timestamp()),
            'airing_time': airing_at.strftime('%I:%M %p'),
            'cover_image': anime.get('cover_image_large'),
            'total_episodes': anime.get('episodes'),
        })

    return sorted(episodes, key=lambda x: x['airing_at'])


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _get_airing_status(airing_at: datetime) -> str:
    """Determine airing status based on time"""
    now = datetime.now(timezone.utc)
    diff = (airing_at - now).total_seconds()

    if diff < 0:
        return 'aired'
    elif diff < 3600:  # Less than 1 hour
        return 'airing_soon'
    elif diff < 86400:  # Less than 24 hours
        return 'airing_today'
    else:
        return 'upcoming'


def _format_time_until(airing_at: datetime) -> str:
    """Format time until airing in human-readable format"""
    now = datetime.now(timezone.utc)
    diff = (airing_at - now).total_seconds()

    if diff < 0:
        return 'Aired'

    days = int(diff // 86400)
    hours = int((diff % 86400) // 3600)
    minutes = int((diff % 3600) // 60)

    if days > 0:
        return f"{days}d {hours}h"
    elif hours > 0:
        return f"{hours}h {minutes}m"
    else:
        return f"{minutes}m"


# =============================================================================
# HYBRID FUNCTIONS (use Supabase if available, fallback to CSV)
# =============================================================================

def get_season_anime(season: str, year: int) -> List[Dict[str, Any]]:
    """
    Get seasonal anime - uses Supabase if configured, otherwise falls back to CSV.
    """
    if _is_supabase_available():
        result = get_season_anime_supabase(season, year)
        if result:
            return result

    # Fallback to CSV-based tools
    from src.tools import get_season_anime as get_season_anime_csv
    return get_season_anime_csv(season, year)


def search_anime(query: str) -> Optional[Dict[str, Any]]:
    """
    Search anime - uses Supabase if configured, otherwise falls back to CSV.
    """
    if _is_supabase_available():
        result = search_anime_supabase(query)
        if result:
            return result

    # Fallback to CSV-based tools
    from src.tools import search_anime as search_anime_csv
    return search_anime_csv(query)


def get_weekly_schedule(weeks_offset: int = 0) -> Dict[str, Any]:
    """
    Get weekly schedule - uses Supabase if configured, otherwise falls back to AniList API.
    """
    if _is_supabase_available():
        result = get_weekly_schedule_supabase(weeks_offset)
        if result.get('total_schedules', 0) > 0:
            return result

    # Fallback to AniList API-based tools
    from src.tools import get_weekly_schedule as get_weekly_schedule_api
    return get_weekly_schedule_api(weeks_offset)
