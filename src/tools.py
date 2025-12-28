"""Tools for the AnimeScheduleAgent."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, List
from collections import defaultdict
import pandas as pd

from src.anilist_client import search_anime_live, get_anime_by_id, get_seasonal_anime, get_weekly_airing_schedule

# Path to data directory (relative to project root)
DATA_DIR = Path(__file__).parent.parent / "data" / "raw"


def _get_current_season() -> tuple[str, int]:
    """Get current anime season and year."""
    today = date.today()
    month = today.month
    year = today.year
    if month in (1, 2, 3):
        return "WINTER", year
    elif month in (4, 5, 6):
        return "SPRING", year
    elif month in (7, 8, 9):
        return "SUMMER", year
    else:
        return "FALL", year


def _run_async(coro):
    """Run async function, handling existing event loops (e.g., FastAPI)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop - safe to use asyncio.run()
        return asyncio.run(coro)

    # Already in async context - run in thread with new event loop
    import concurrent.futures

    def run_in_thread():
        # Create a new event loop for this thread
        new_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(new_loop)
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()

    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(run_in_thread)
        return future.result()


def get_week_range(weeks_offset: int = 0) -> tuple[int, int]:
    """
    Get start and end timestamps for a week in LOCAL timezone.
    This ensures consistency with the frontend Schedule tab which uses local time.

    Args:
        weeks_offset: Number of weeks to offset (0 = current week, 1 = next week, -1 = last week)

    Returns:
        Tuple of (start_timestamp, end_timestamp)
    """
    # Use local timezone for consistency with frontend
    now = datetime.now()
    # Start of week (Monday at 00:00)
    start_of_week = now - timedelta(days=now.weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)

    # Apply offset
    start_of_week = start_of_week + timedelta(weeks=weeks_offset)
    end_of_week = start_of_week + timedelta(days=7)

    return int(start_of_week.timestamp()), int(end_of_week.timestamp())


def get_day_range(days_offset: int = 0) -> tuple[int, int]:
    """
    Get start and end timestamps for a specific day in LOCAL timezone.
    This ensures consistency with the frontend Schedule tab which uses local time.

    Args:
        days_offset: Number of days to offset (0 = today, 1 = tomorrow, -1 = yesterday)

    Returns:
        Tuple of (start_timestamp, end_timestamp)
    """
    # Use local timezone for consistency with frontend
    now = datetime.now()
    target_day = now + timedelta(days=days_offset)
    start_of_day = target_day.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = start_of_day + timedelta(days=1)

    return int(start_of_day.timestamp()), int(end_of_day.timestamp())


def group_schedules_by_day(schedules: list[dict]) -> dict[str, list[dict]]:
    """
    Group airing schedules by day of week in LOCAL timezone.
    This ensures consistency with the frontend Schedule tab which uses local time.

    Args:
        schedules: List of schedule items from get_weekly_airing_schedule

    Returns:
        Dict with day names as keys and lists of schedules as values
    """
    schedule_by_day = defaultdict(list)

    for schedule in schedules:
        # Convert timestamp to LOCAL day name (not UTC)
        airing_time = datetime.fromtimestamp(schedule['airing_at'])  # Local timezone
        day_name = airing_time.strftime('%A').upper()  # MONDAY, TUESDAY, etc.

        # Determine if it's airing soon or already aired
        time_until = schedule['time_until_airing']
        if time_until < 0:
            airing_status = 'aired'
        elif time_until < 3600:  # Less than 1 hour
            airing_status = 'airing_soon'
        elif time_until < 86400:  # Less than 24 hours
            airing_status = 'airing_today'
        else:
            airing_status = 'upcoming'

        schedule_by_day[day_name].append({
            **schedule,
            'airing_status': airing_status,
            'airing_time': airing_time.strftime('%I:%M %p'),
            'airing_date': airing_time.strftime('%Y-%m-%d')
        })

    # Sort each day's schedules by time
    for day in schedule_by_day:
        schedule_by_day[day].sort(key=lambda x: x['airing_at'])

    return dict(schedule_by_day)


def _load_latest_csv(pattern: str) -> Optional[pd.DataFrame]:
    """Load the most recent CSV matching pattern."""
    if not DATA_DIR.exists():
        return None
    files = sorted(DATA_DIR.glob(pattern), reverse=True)
    if not files:
        return None
    return pd.read_csv(files[0])


def _load_anime_database() -> Optional[pd.DataFrame]:
    """Load the comprehensive anime database with all fields."""
    df = _load_latest_csv("anilist_seasonal_*.csv")
    if df is None:
        return None

    # Preprocess for easier searching
    df['title_lower'] = df['title'].str.lower().fillna('')
    df['english_title_lower'] = df['english_title'].str.lower().fillna('')
    df['genres'] = df['genres'].fillna('')
    df['tags'] = df['tags'].fillna('')
    df['synopsis'] = df['synopsis'].fillna('')
    df['score'] = pd.to_numeric(df['score'], errors='coerce').fillna(0)
    df['members'] = pd.to_numeric(df['members'], errors='coerce').fillna(0)
    df['episodes'] = pd.to_numeric(df['episodes'], errors='coerce')

    return df


def _parse_genres(genres_str: str) -> list[str]:
    """Parse genre string (semicolon or comma separated) to list."""
    if not genres_str or pd.isna(genres_str):
        return []
    # Handle both semicolon and comma separators
    if ';' in str(genres_str):
        return [g.strip() for g in str(genres_str).split(';') if g.strip()]
    return [g.strip() for g in str(genres_str).split(',') if g.strip()]


def _format_anime_result(row: pd.Series) -> dict:
    """Format a DataFrame row as anime result dict."""
    return {
        "anime_id": int(row.get("anime_id", 0)),
        "title": row.get("title", ""),
        "english_title": row.get("english_title") if pd.notna(row.get("english_title")) else None,
        "japanese_title": row.get("japanese_title") if pd.notna(row.get("japanese_title")) else None,
        "synopsis": row.get("synopsis") if pd.notna(row.get("synopsis")) else None,
        "status": row.get("status", "UNKNOWN"),
        "type": row.get("type") if pd.notna(row.get("type")) else None,
        "episodes": int(row["episodes"]) if pd.notna(row.get("episodes")) else None,
        "duration": row.get("duration") if pd.notna(row.get("duration")) else None,
        "score": float(row["score"]) if pd.notna(row.get("score")) and row.get("score") > 0 else None,
        "members": int(row["members"]) if pd.notna(row.get("members")) else None,
        "popularity": int(row["popularity"]) if pd.notna(row.get("popularity")) else None,
        "genres": _parse_genres(row.get("genres", "")),
        "tags": _parse_genres(row.get("tags", ""))[:10],  # Limit tags
        "studios": row.get("main_studios") if pd.notna(row.get("main_studios")) else None,
        "source": row.get("source") if pd.notna(row.get("source")) else None,
        "season": row.get("season") if pd.notna(row.get("season")) else None,
        "season_year": int(row["season_year"]) if pd.notna(row.get("season_year")) else None,
        "start_date": row.get("start_date") if pd.notna(row.get("start_date")) else None,
        "end_date": row.get("end_date") if pd.notna(row.get("end_date")) else None,
        "cover_image": row.get("cover_image_large") if pd.notna(row.get("cover_image_large")) else None,
        "is_adult": bool(row.get("is_adult")) if pd.notna(row.get("is_adult")) else False,
        "site_url": row.get("site_url") if pd.notna(row.get("site_url")) else None,
    }


def _calculate_episode_interval_from_schedule(airing_schedule: list[dict]) -> Optional[int]:
    """
    Calculate average days between episodes from the full airing schedule.
    Returns the most common interval, or None if schedule is too small.
    """
    if not airing_schedule or len(airing_schedule) < 2:
        return None

    intervals = []
    for i in range(1, len(airing_schedule)):
        prev_timestamp = airing_schedule[i-1].get("airs_at_timestamp")
        curr_timestamp = airing_schedule[i].get("airs_at_timestamp")

        if prev_timestamp and curr_timestamp:
            days_diff = (curr_timestamp - prev_timestamp) // 86400  # Convert seconds to days
            intervals.append(int(days_diff))

    if not intervals:
        return None

    # Return the most common interval (mode)
    from collections import Counter
    interval_counts = Counter(intervals)
    most_common_interval = interval_counts.most_common(1)[0][0]

    return most_common_interval


def _calculate_episode_interval(next_airing_timestamp: Optional[int], current_ep: int, airing_schedule: Optional[list[dict]] = None) -> int:
    """
    Calculate days between episodes.
    Priority: 1) Use full airing schedule, 2) Infer from next airing time, 3) Default to weekly.
    """
    # Priority 1: Calculate from full schedule if available
    if airing_schedule:
        interval = _calculate_episode_interval_from_schedule(airing_schedule)
        if interval:
            return interval

    # Priority 2: Infer from next airing timestamp
    if next_airing_timestamp and current_ep > 0:
        next_air = datetime.fromtimestamp(next_airing_timestamp, tz=timezone.utc).date()
        days_until_next = (next_air - date.today()).days

        if days_until_next > 0:
            if days_until_next <= 2:
                return 1  # Daily
            elif days_until_next >= 12:
                return 14  # Bi-weekly
            else:
                return 7  # Weekly

    # Default to weekly (most common)
    return 7


def _calculate_completion_date(
    current_ep: Optional[int],
    total_eps: Optional[int],
    status: str,
    end_date: Optional[str] = None,
    next_airing_timestamp: Optional[int] = None,
    airing_schedule: Optional[list[dict]] = None
) -> tuple[Optional[date], str, str]:
    """
    Calculate predicted completion date.
    Returns: (predicted_date, confidence, reason)
    """
    if status == "FINISHED":
        if end_date:
            return date.fromisoformat(end_date), "high", "Already finished airing"
        return date.today(), "high", "Already finished airing"

    if status == "NOT_YET_RELEASED":
        return None, "unknown", "Not yet started airing"

    if status in ("CANCELLED", "HIATUS"):
        return None, "unknown", f"Status is {status}"

    if status == "RELEASING":
        if not total_eps:
            return None, "low", "Unknown total episode count"

        if not current_ep:
            current_ep = 0

        remaining = total_eps - current_ep
        if remaining <= 0:
            return date.today() + timedelta(days=7), "medium", "May have just finished or finale pending"

        # Use smart interval calculation with schedule data
        episode_interval = _calculate_episode_interval(next_airing_timestamp, current_ep, airing_schedule)
        days_until_complete = remaining * episode_interval
        predicted = date.today() + timedelta(days=days_until_complete)

        # Adjust confidence based on remaining episodes and whether we have schedule data
        has_schedule = airing_schedule and len(airing_schedule) >= 2

        if remaining <= 2:
            confidence = "high"
        elif remaining <= 6:
            confidence = "high" if has_schedule else "medium"
        else:
            confidence = "medium" if (remaining <= 12 or has_schedule) else "low"

        interval_str = {1: "daily", 7: "weekly", 14: "bi-weekly"}.get(episode_interval, f"every {episode_interval} days")
        source = "calculated from airing schedule" if has_schedule else "estimated"
        reason = f"{remaining} episodes remaining ({interval_str} releases, {source})"

        return predicted, confidence, reason

    return None, "unknown", f"Unknown status: {status}"


# === TOOL FUNCTIONS ===

def search_anime_cache(query: str) -> list[dict]:
    """
    Search for anime by title in cached CSV data.
    Use this for quick lookups without API calls.
    """
    df = _load_latest_csv("anilist_seasonal_*.csv")
    if df is None:
        return [{"error": "No cached data found"}]
    
    query_lower = query.lower()
    mask = df["title"].str.lower().str.contains(query_lower, na=False)
    
    if "title_english" in df.columns:
        mask |= df["title_english"].str.lower().str.contains(query_lower, na=False)
    
    matches = df[mask].head(10)
    
    if matches.empty:
        return []
    
    results = []
    for _, row in matches.iterrows():
        results.append({
            "anime_id": int(row.get("anime_id", 0)),
            "title": row.get("title", ""),
            "status": row.get("status", "UNKNOWN"),
            "episodes": int(row["episodes"]) if pd.notna(row.get("episodes")) else None,
            "score": float(row["score"]) if pd.notna(row.get("score")) else None,
            "season": row.get("season"),
            "season_year": int(row["season_year"]) if pd.notna(row.get("season_year")) else None,
            "source": "cache"
        })
    return results


def search_anime(query: str) -> dict:
    """
    Search for anime by title using live AniList API.
    Use this when you need current airing information.
    """
    result = _run_async(search_anime_live(query))
    if result:
        result["source"] = "live"
    return result or {"error": f"No anime found matching '{query}'"}


def get_anime_schedule(anime_id: int) -> dict:
    """
    Get detailed schedule info for an anime by its AniList ID.
    Includes next episode timing and airing schedule.
    """
    result = _run_async(get_anime_by_id(anime_id))
    if result:
        result["source"] = "live"
    return result or {"error": f"No anime found with ID {anime_id}"}


def predict_completion(
    anime_id: int,
    title: str,
    status: str,
    current_episode: Optional[int] = None,
    total_episodes: Optional[int] = None,
    end_date: Optional[str] = None,
    predicted_end_from_schedule: Optional[str] = None,
    next_airing_at: Optional[int] = None,
    airing_schedule: Optional[list[dict]] = None
) -> dict:
    """
    Predict when an anime will finish airing.

    Args:
        anime_id: AniList anime ID
        title: Anime title
        status: Current status (FINISHED, RELEASING, etc.)
        current_episode: Latest aired episode number
        total_episodes: Total planned episodes
        end_date: Known end date if available (YYYY-MM-DD)
        predicted_end_from_schedule: End date from AniList's airing schedule
        next_airing_at: Unix timestamp of next episode
        airing_schedule: Full episode airing schedule

    Returns:
        Prediction with completion date
    """
    # Priority 1: Use AniList's known schedule if available
    if predicted_end_from_schedule and status == "RELEASING":
        pred_date = date.fromisoformat(predicted_end_from_schedule)
        days_until = (pred_date - date.today()).days
        return {
            "anime_id": anime_id,
            "title": title,
            "status": status,
            "current_episode": current_episode,
            "total_episodes": total_episodes,
            "predicted_completion": pred_date.isoformat(),
            "days_until_complete": max(0, days_until),
        }

    # Priority 2: Calculate from available data using full schedule
    predicted_date, confidence, reason = _calculate_completion_date(
        current_episode, total_episodes, status, end_date, next_airing_at, airing_schedule
    )

    days_until = None
    if predicted_date:
        days_until = (predicted_date - date.today()).days
        if days_until < 0:
            days_until = 0

    return {
        "anime_id": anime_id,
        "title": title,
        "status": status,
        "current_episode": current_episode,
        "total_episodes": total_episodes,
        "predicted_completion": predicted_date.isoformat() if predicted_date else None,
        "days_until_complete": days_until,
    }


def get_season_anime(season: str, year: int) -> list[dict]:
    """
    Get all anime from a specific season with enhanced predictions.
    """
    anime_list = _run_async(get_seasonal_anime(season, year))

    # Add predictions to each anime
    results = []
    for anime in anime_list:
        # Extract next airing timestamp if available
        next_airing_at = anime.get("next_airing_at")
        if not next_airing_at and anime.get("next_episode"):
            next_airing_at = anime["next_episode"].get("airs_at_timestamp")

        prediction = predict_completion(
            anime_id=anime["anime_id"],
            title=anime["title"],
            status=anime["status"],
            current_episode=anime.get("current_episode"),
            total_episodes=anime.get("episodes"),
            end_date=anime.get("end_date"),
            predicted_end_from_schedule=anime.get("predicted_end_from_schedule"),
            next_airing_at=next_airing_at,
            airing_schedule=anime.get("airing_schedule")  # Pass full schedule
        )
        # Merge anime info with prediction
        anime.update(prediction)
        anime["source"] = "live"
        results.append(anime)

    return results


# === NEW COMPREHENSIVE TOOLS ===

def get_anime_details(query: str) -> dict:
    """
    Get comprehensive details about an anime including synopsis, genres, score, and more.
    Use this when user asks about what an anime is about, its description, genres, or ratings.
    """
    df = _load_anime_database()
    if df is None:
        # Fallback to live search
        result = _run_async(search_anime_live(query))
        if result:
            result["source"] = "live"
            return result
        return {"error": "No data available"}

    query_lower = query.lower().strip()

    # Exact match first
    exact = df[df['title_lower'] == query_lower]
    if exact.empty:
        exact = df[df['english_title_lower'] == query_lower]

    if not exact.empty:
        return _format_anime_result(exact.iloc[0])

    # Contains match
    contains = df[
        df['title_lower'].str.contains(query_lower, na=False) |
        df['english_title_lower'].str.contains(query_lower, na=False)
    ]

    if not contains.empty:
        # Return best match (highest score/members)
        best = contains.sort_values(['score', 'members'], ascending=False).iloc[0]
        return _format_anime_result(best)

    # Fallback to live search
    result = _run_async(search_anime_live(query))
    if result:
        result["source"] = "live"
        return result

    return {"error": f"No anime found matching '{query}'"}


def get_anime_by_genre(
    genres: list[str],
    min_score: Optional[float] = None,
    limit: int = 20,
    include_adult: bool = True
) -> list[dict]:
    """
    Get anime that match specified genres.
    Use this when user asks for anime recommendations by genre.
    """
    df = _load_anime_database()
    if df is None:
        return [{"error": "No cached data available"}]

    # Normalize genres to lowercase
    target_genres = [g.lower().strip() for g in genres]

    results = []
    for _, row in df.iterrows():
        # Filter adult content if requested
        if not include_adult and row.get('is_adult'):
            continue

        anime_genres = [g.lower() for g in _parse_genres(row.get('genres', ''))]

        # Check if any target genre matches
        matching_genres = [g for g in target_genres if any(g in ag for ag in anime_genres)]

        if matching_genres:
            score = float(row['score']) if pd.notna(row.get('score')) else 0
            if min_score and score < min_score:
                continue

            result = _format_anime_result(row)
            result['matching_genres'] = matching_genres
            result['match_count'] = len(matching_genres)
            results.append(result)

    # Sort by match count and score
    results.sort(key=lambda x: (-x['match_count'], -(x.get('score') or 0)))

    return results[:limit]


def get_top_anime(
    min_score: float = 70,
    limit: int = 20,
    status: Optional[str] = None,
    include_adult: bool = True
) -> list[dict]:
    """
    Get top-rated anime above a minimum score.
    Use this when user asks for best anime, highest rated, or top recommendations.
    """
    df = _load_anime_database()
    if df is None:
        return [{"error": "No cached data available"}]

    # Filter by score
    filtered = df[df['score'] >= min_score]

    # Filter by status if specified
    if status:
        filtered = filtered[filtered['status'] == status.upper()]

    # Filter adult content if requested
    if not include_adult:
        filtered = filtered[filtered['is_adult'] != True]

    # Sort by score descending
    sorted_df = filtered.sort_values('score', ascending=False)

    results = []
    for _, row in sorted_df.head(limit).iterrows():
        results.append(_format_anime_result(row))

    return results


def get_similar_anime(
    anime_title: str,
    limit: int = 10,
    min_score: float = 60,
    include_adult: bool = True
) -> list[dict]:
    """
    Get anime similar to a given title based on shared genres and tags.
    Use this when user asks for recommendations similar to an anime.
    """
    df = _load_anime_database()
    if df is None:
        return [{"error": "No cached data available"}]

    query_lower = anime_title.lower().strip()

    # Find target anime
    target = df[
        (df['title_lower'] == query_lower) |
        (df['english_title_lower'] == query_lower) |
        df['title_lower'].str.contains(query_lower, na=False)
    ]

    if target.empty:
        return [{"error": f"Could not find anime: {anime_title}"}]

    target_row = target.iloc[0]
    target_id = target_row['anime_id']
    target_genres = set(g.lower() for g in _parse_genres(target_row.get('genres', '')))
    target_tags = set(t.lower() for t in _parse_genres(target_row.get('tags', '')))
    target_title_words = set(str(target_row['title']).lower().split())

    recommendations = []
    for _, row in df.iterrows():
        # Skip same anime
        if row['anime_id'] == target_id:
            continue

        # Filter adult content if requested
        if not include_adult and row.get('is_adult'):
            continue

        # Score filter
        score = float(row['score']) if pd.notna(row.get('score')) else 0
        if score < min_score:
            continue

        anime_genres = set(g.lower() for g in _parse_genres(row.get('genres', '')))
        anime_tags = set(t.lower() for t in _parse_genres(row.get('tags', '')))

        # Skip sequels (share 2+ title words)
        anime_title_words = set(str(row['title']).lower().split())
        if len(target_title_words.intersection(anime_title_words)) >= 2:
            continue

        # Calculate similarity
        shared_genres = target_genres.intersection(anime_genres)
        shared_tags = target_tags.intersection(anime_tags)

        if not shared_genres:
            continue

        # Similarity score
        genre_similarity = len(shared_genres) / len(target_genres) if target_genres else 0
        tag_similarity = len(shared_tags) / len(target_tags) if target_tags else 0
        overall_similarity = (genre_similarity * 0.6) + (tag_similarity * 0.4)

        if overall_similarity > 0.3:  # At least 30% similar
            result = _format_anime_result(row)
            result['similarity_score'] = round(overall_similarity * 100, 1)
            result['shared_genres'] = list(shared_genres)
            result['shared_tags'] = list(shared_tags)[:5]
            recommendations.append(result)

    # Sort by similarity
    recommendations.sort(key=lambda x: -x['similarity_score'])

    return recommendations[:limit]


def get_anime_ending_on_date(target_date: str) -> list[dict]:
    """
    Get anime that have their FINAL episode (ending) on a specific date.
    Use for queries like "which anime ending today/tomorrow" or specific dates.

    Args:
        target_date: Date string - "today", "tomorrow", or YYYY-MM-DD format
    """
    # Parse target date
    if target_date.lower() == "today":
        check_date = date.today()
    elif target_date.lower() == "tomorrow":
        check_date = date.today() + timedelta(days=1)
    elif target_date.lower() == "yesterday":
        check_date = date.today() - timedelta(days=1)
    else:
        try:
            check_date = date.fromisoformat(target_date)
        except ValueError:
            return [{"error": f"Invalid date format: {target_date}. Use 'today', 'tomorrow', or YYYY-MM-DD"}]

    check_date_str = check_date.isoformat()

    # Get current season anime with predictions
    season, year = _get_current_season()
    all_anime = get_season_anime(season, year)

    ending_anime = []
    for anime in all_anime:
        predicted = anime.get("predicted_completion")
        end_date = anime.get("end_date")

        # Check if anime ends on the target date
        if predicted == check_date_str or end_date == check_date_str:
            # Verify it's actually ending (not just any episode)
            total_eps = anime.get("total_episodes") or anime.get("episodes")
            current_ep = anime.get("current_episode")

            if total_eps and current_ep:
                remaining = total_eps - current_ep
                if remaining <= 1:  # Last or second to last episode
                    anime['is_finale'] = True
                    ending_anime.append(anime)
            elif anime.get("status") == "FINISHED":
                anime['is_finale'] = True
                ending_anime.append(anime)

    return ending_anime


def get_anime_ending_in_range(start_date: str, end_date: str) -> list[dict]:
    """
    Get anime that will finish airing within a date range.
    Use for queries like "which anime finishing this week" or "ending this month".

    Args:
        start_date: Start date - "today" or YYYY-MM-DD
        end_date: End date - "today", "+7days", "+30days", or YYYY-MM-DD
    """
    # Parse start date
    if start_date.lower() == "today":
        start = date.today()
    else:
        try:
            start = date.fromisoformat(start_date)
        except ValueError:
            return [{"error": f"Invalid start date: {start_date}"}]

    # Parse end date
    if end_date.lower() == "today":
        end = date.today()
    elif end_date.startswith("+"):
        try:
            days = int(end_date[1:].replace("days", "").replace("day", "").strip())
            end = date.today() + timedelta(days=days)
        except ValueError:
            return [{"error": f"Invalid end date format: {end_date}"}]
    else:
        try:
            end = date.fromisoformat(end_date)
        except ValueError:
            return [{"error": f"Invalid end date: {end_date}"}]

    # Get current season anime
    season, year = _get_current_season()
    all_anime = get_season_anime(season, year)

    ending_anime = []
    for anime in all_anime:
        predicted = anime.get("predicted_completion")
        anime_end = anime.get("end_date")

        check_date = predicted or anime_end
        if not check_date:
            continue

        try:
            anime_date = date.fromisoformat(check_date)
            if start <= anime_date <= end:
                ending_anime.append(anime)
        except ValueError:
            continue

    # Sort by completion date
    ending_anime.sort(key=lambda x: x.get("predicted_completion") or x.get("end_date") or "9999-12-31")

    return ending_anime


def get_episodes_airing_on_date(target_date: str) -> list[dict]:
    """
    Get all episodes airing on a specific date (not just finales).
    Use for "what episodes air today/tomorrow" or schedule queries.

    Args:
        target_date: "today", "tomorrow", or YYYY-MM-DD
    """
    # Calculate days offset
    if target_date.lower() == "today":
        days_offset = 0
    elif target_date.lower() == "tomorrow":
        days_offset = 1
    elif target_date.lower() == "yesterday":
        days_offset = -1
    else:
        try:
            target = date.fromisoformat(target_date)
            days_offset = (target - date.today()).days
        except ValueError:
            return [{"error": f"Invalid date: {target_date}"}]

    start_time, end_time = get_day_range(days_offset)
    schedules = _run_async(get_weekly_airing_schedule(start_time, end_time))

    # Add finale flag
    for schedule in schedules:
        total_eps = schedule.get("total_episodes")
        ep_num = schedule.get("episode")
        if total_eps and ep_num and ep_num == total_eps:
            schedule["is_finale"] = True
        else:
            schedule["is_finale"] = False

    return schedules


def get_finale_episodes_this_week() -> list[dict]:
    """
    Get only FINALE episodes (last episode of a series) airing this week.
    Use for "which anime are having their final episode this week".
    """
    start_time, end_time = get_week_range(0)
    schedules = _run_async(get_weekly_airing_schedule(start_time, end_time))

    finales = []
    for schedule in schedules:
        total_eps = schedule.get("total_episodes")
        ep_num = schedule.get("episode")

        if total_eps and ep_num and ep_num == total_eps:
            schedule["is_finale"] = True
            airing_time = datetime.fromtimestamp(schedule['airing_at'], tz=timezone.utc)
            schedule["airing_date"] = airing_time.strftime("%Y-%m-%d")
            schedule["airing_day"] = airing_time.strftime("%A")
            finales.append(schedule)

    # Sort by airing time
    finales.sort(key=lambda x: x['airing_at'])

    return finales


def search_anime_advanced(
    query: Optional[str] = None,
    genres: Optional[list[str]] = None,
    min_score: Optional[float] = None,
    status: Optional[str] = None,
    season: Optional[str] = None,
    year: Optional[int] = None,
    include_adult: bool = True,
    limit: int = 20
) -> list[dict]:
    """
    Advanced anime search with multiple filters.
    Use when user wants to filter by multiple criteria.
    """
    df = _load_anime_database()
    if df is None:
        return [{"error": "No cached data available"}]

    filtered = df.copy()

    # Apply filters
    if query:
        query_lower = query.lower()
        filtered = filtered[
            filtered['title_lower'].str.contains(query_lower, na=False) |
            filtered['english_title_lower'].str.contains(query_lower, na=False)
        ]

    if min_score:
        filtered = filtered[filtered['score'] >= min_score]

    if status:
        filtered = filtered[filtered['status'] == status.upper()]

    if season:
        filtered = filtered[filtered['season'] == season.upper()]

    if year:
        filtered = filtered[filtered['season_year'] == year]

    if not include_adult:
        filtered = filtered[filtered['is_adult'] != True]

    # Genre filter
    if genres:
        target_genres = [g.lower() for g in genres]

        def has_genres(row):
            anime_genres = [g.lower() for g in _parse_genres(row.get('genres', ''))]
            return any(tg in ag for tg in target_genres for ag in anime_genres)

        filtered = filtered[filtered.apply(has_genres, axis=1)]

    # Sort by score
    sorted_df = filtered.sort_values(['score', 'members'], ascending=False)

    results = []
    for _, row in sorted_df.head(limit).iterrows():
        results.append(_format_anime_result(row))

    return results


def get_weekly_schedule(weeks_offset: int = 0) -> dict:
    """
    Get all anime episodes airing in a specific week, grouped by day (AniChart-style).

    Args:
        weeks_offset: Number of weeks to offset (0 = current week, 1 = next week, -1 = last week)

    Returns:
        Dict with week info and schedule grouped by day
    """
    start_time, end_time = get_week_range(weeks_offset)

    # Fetch airing schedules
    schedules = _run_async(get_weekly_airing_schedule(start_time, end_time))

    # Group by day
    schedule_by_day = group_schedules_by_day(schedules)

    # Calculate week dates
    start_date = datetime.fromtimestamp(start_time, tz=timezone.utc)
    end_date = datetime.fromtimestamp(end_time, tz=timezone.utc)

    return {
        "week_start": start_date.strftime("%Y-%m-%d"),
        "week_end": end_date.strftime("%Y-%m-%d"),
        "week_label": f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d, %Y')}",
        "total_schedules": len(schedules),
        "schedule": schedule_by_day,
        "days_with_anime": list(schedule_by_day.keys())
    }


# Tool definitions for Gemini
TOOL_DEFINITIONS = [
    {
        "name": "get_anime_details",
        "description": "Get comprehensive details about an anime including synopsis, genres, score, studios, and more. Use when user asks what an anime is about, its description, rating, or wants detailed info.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Anime title to search for"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_anime_by_genre",
        "description": "Get anime that match specified genres. Use when user asks for anime by genre like 'action anime', 'romance recommendations', etc.",
        "parameters": {
            "type": "object",
            "properties": {
                "genres": {"type": "array", "items": {"type": "string"}, "description": "List of genres to match (e.g., ['Action', 'Fantasy'])"},
                "min_score": {"type": "number", "description": "Minimum score filter (0-100)"},
                "limit": {"type": "integer", "description": "Max results to return (default 20)"},
                "include_adult": {"type": "boolean", "description": "Include adult/18+ content (default true)"}
            },
            "required": ["genres"]
        }
    },
    {
        "name": "get_top_anime",
        "description": "Get highest rated anime above a score threshold. Use for 'best anime', 'top rated', or quality recommendations.",
        "parameters": {
            "type": "object",
            "properties": {
                "min_score": {"type": "number", "description": "Minimum score (default 70)"},
                "limit": {"type": "integer", "description": "Max results (default 20)"},
                "status": {"type": "string", "description": "Filter by status: FINISHED, RELEASING, NOT_YET_RELEASED"},
                "include_adult": {"type": "boolean", "description": "Include adult content (default true)"}
            },
            "required": []
        }
    },
    {
        "name": "get_similar_anime",
        "description": "Get anime similar to a given title based on shared genres and tags. Use for 'anime like X' or 'similar to X' requests.",
        "parameters": {
            "type": "object",
            "properties": {
                "anime_title": {"type": "string", "description": "Title of anime to find similar shows for"},
                "limit": {"type": "integer", "description": "Max recommendations (default 10)"},
                "min_score": {"type": "number", "description": "Minimum score filter (default 60)"},
                "include_adult": {"type": "boolean", "description": "Include adult content (default true)"}
            },
            "required": ["anime_title"]
        }
    },
    {
        "name": "get_anime_ending_on_date",
        "description": "Get anime having their FINAL episode on a specific date. Use for 'which anime ending today/tomorrow' queries. Returns only anime with finale on that exact date.",
        "parameters": {
            "type": "object",
            "properties": {
                "target_date": {"type": "string", "description": "Date: 'today', 'tomorrow', 'yesterday', or YYYY-MM-DD"}
            },
            "required": ["target_date"]
        }
    },
    {
        "name": "get_anime_ending_in_range",
        "description": "Get anime finishing within a date range. Use for 'finishing this week', 'ending this month' queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "start_date": {"type": "string", "description": "Start: 'today' or YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "End: 'today', '+7days', '+30days', or YYYY-MM-DD"}
            },
            "required": ["start_date", "end_date"]
        }
    },
    {
        "name": "get_episodes_airing_on_date",
        "description": "Get all episodes (not just finales) airing on a date. Use for 'what airs today/tomorrow' or schedule queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "target_date": {"type": "string", "description": "Date: 'today', 'tomorrow', or YYYY-MM-DD"}
            },
            "required": ["target_date"]
        }
    },
    {
        "name": "get_finale_episodes_this_week",
        "description": "Get only FINALE episodes airing this week. Use for 'which anime have final episode this week' queries.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "search_anime_advanced",
        "description": "Advanced search with multiple filters: title, genres, score, status, season, year. Use for complex queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Title search (optional)"},
                "genres": {"type": "array", "items": {"type": "string"}, "description": "Genre filter"},
                "min_score": {"type": "number", "description": "Minimum score"},
                "status": {"type": "string", "description": "Status: FINISHED, RELEASING, NOT_YET_RELEASED"},
                "season": {"type": "string", "description": "Season: WINTER, SPRING, SUMMER, FALL"},
                "year": {"type": "integer", "description": "Year"},
                "include_adult": {"type": "boolean", "description": "Include adult content"},
                "limit": {"type": "integer", "description": "Max results"}
            },
            "required": []
        }
    },
    {
        "name": "get_season_anime",
        "description": "Get all anime from a specific season with episode predictions. Use for seasonal overviews.",
        "parameters": {
            "type": "object",
            "properties": {
                "season": {"type": "string", "description": "Season: WINTER, SPRING, SUMMER, FALL"},
                "year": {"type": "integer", "description": "Year (e.g., 2025)"}
            },
            "required": ["season", "year"]
        }
    },
    {
        "name": "get_weekly_schedule",
        "description": "Get weekly airing schedule grouped by day. Use for 'what airs this week' or schedule views.",
        "parameters": {
            "type": "object",
            "properties": {
                "weeks_offset": {"type": "integer", "description": "Week offset: 0=current, 1=next, -1=last week"}
            },
            "required": []
        }
    },
    {
        "name": "search_anime",
        "description": "Search for anime by title using live AniList API. Use when you need current episode/airing info.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Anime title to search for"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "predict_completion",
        "description": "Calculate predicted completion date for an anime. Use with data from search tools.",
        "parameters": {
            "type": "object",
            "properties": {
                "anime_id": {"type": "integer", "description": "AniList anime ID"},
                "title": {"type": "string", "description": "Anime title"},
                "status": {"type": "string", "description": "Status: FINISHED, RELEASING, NOT_YET_RELEASED"},
                "current_episode": {"type": "integer", "description": "Latest aired episode"},
                "total_episodes": {"type": "integer", "description": "Total planned episodes"},
                "end_date": {"type": "string", "description": "Known end date (YYYY-MM-DD)"},
                "predicted_end_from_schedule": {"type": "string", "description": "AniList's scheduled end date"},
                "next_airing_at": {"type": "integer", "description": "Unix timestamp of next episode"}
            },
            "required": ["anime_id", "title", "status"]
        }
    }
]

# Map tool names to functions
TOOL_FUNCTIONS = {
    "get_anime_details": get_anime_details,
    "get_anime_by_genre": get_anime_by_genre,
    "get_top_anime": get_top_anime,
    "get_similar_anime": get_similar_anime,
    "get_anime_ending_on_date": get_anime_ending_on_date,
    "get_anime_ending_in_range": get_anime_ending_in_range,
    "get_episodes_airing_on_date": get_episodes_airing_on_date,
    "get_finale_episodes_this_week": get_finale_episodes_this_week,
    "search_anime_advanced": search_anime_advanced,
    "get_season_anime": get_season_anime,
    "get_weekly_schedule": get_weekly_schedule,
    "search_anime": search_anime,
    "predict_completion": predict_completion,
}