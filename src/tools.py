"""Tools for the AnimeScheduleAgent."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import pandas as pd

from src.anilist_client import search_anime_live, get_anime_by_id, get_seasonal_anime

# Path to data directory (relative to project root)
DATA_DIR = Path(__file__).parent.parent / "data" / "raw"


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


def _load_latest_csv(pattern: str) -> Optional[pd.DataFrame]:
    """Load the most recent CSV matching pattern."""
    if not DATA_DIR.exists():
        return None
    files = sorted(DATA_DIR.glob(pattern), reverse=True)
    if not files:
        return None
    return pd.read_csv(files[0])


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
        Prediction with completion date and confidence
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
            "confidence": "high",
            "confidence_reason": "Based on AniList's official airing schedule",
            "days_until_complete": max(0, days_until),
            "is_bingeable": days_until <= 0
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
        "confidence": confidence,
        "confidence_reason": reason,
        "days_until_complete": days_until,
        "is_bingeable": status == "FINISHED" or (days_until is not None and days_until <= 0)
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


def get_bingeable_anime(season: str, year: int, by_date: Optional[str] = None) -> list[dict]:
    """
    Get anime that are finished or will be finished by a specific date.
    Perfect for finding what you can binge-watch.
    """
    all_anime = get_season_anime(season, year)
    
    cutoff = date.fromisoformat(by_date) if by_date else date.today()
    
    bingeable = []
    for anime in all_anime:
        # Already finished
        if anime["status"] == "FINISHED":
            bingeable.append(anime)
            continue
        
        # Check if will be done by cutoff
        if anime.get("predicted_completion"):
            pred_date = date.fromisoformat(anime["predicted_completion"])
            if pred_date <= cutoff:
                bingeable.append(anime)
    
    # Sort by completion date
    bingeable.sort(key=lambda x: x.get("predicted_completion") or "9999-12-31")
    
    return bingeable


# Tool definitions for Gemini
TOOL_DEFINITIONS = [
    {
        "name": "search_anime_cache",
        "description": "Search for anime by title in cached CSV data. Fast but may not have latest airing info. Use for initial lookups.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Anime title to search for (partial match supported)"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "search_anime",
        "description": "Search for anime by title using live AniList API. Use when you need current episode/airing info.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Anime title to search for"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_anime_schedule",
        "description": "Get detailed schedule info for an anime by its AniList ID. Use after finding anime via search.",
        "parameters": {
            "type": "object",
            "properties": {
                "anime_id": {
                    "type": "integer",
                    "description": "AniList anime ID"
                }
            },
            "required": ["anime_id"]
        }
    },
    {
        "name": "predict_completion",
        "description": "Calculate predicted completion date for an anime. Use with data from search or schedule tools.",
        "parameters": {
            "type": "object",
            "properties": {
                "anime_id": {"type": "integer", "description": "AniList anime ID"},
                "title": {"type": "string", "description": "Anime title"},
                "status": {"type": "string", "description": "Status: FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED, HIATUS"},
                "current_episode": {"type": "integer", "description": "Latest aired episode"},
                "total_episodes": {"type": "integer", "description": "Total planned episodes"},
                "end_date": {"type": "string", "description": "Known end date (YYYY-MM-DD)"},
                "predicted_end_from_schedule": {"type": "string", "description": "AniList's scheduled end date (YYYY-MM-DD)"},
                "next_airing_at": {"type": "integer", "description": "Unix timestamp of next episode airing"}
            },
            "required": ["anime_id", "title", "status"]
        }
    },
    {
        "name": "get_season_anime",
        "description": "Get all anime from a specific season with predictions. Use for seasonal queries.",
        "parameters": {
            "type": "object",
            "properties": {
                "season": {"type": "string", "description": "Season: Winter, Spring, Summer, Fall"},
                "year": {"type": "integer", "description": "Year (e.g., 2025)"}
            },
            "required": ["season", "year"]
        }
    },
    {
        "name": "get_bingeable_anime",
        "description": "Get anime that are finished or will finish by a date. Perfect for finding binge-watchable shows.",
        "parameters": {
            "type": "object",
            "properties": {
                "season": {"type": "string", "description": "Season: Winter, Spring, Summer, Fall"},
                "year": {"type": "integer", "description": "Year (e.g., 2025)"},
                "by_date": {"type": "string", "description": "Cutoff date (YYYY-MM-DD). Shows finishing by this date."}
            },
            "required": ["season", "year"]
        }
    }
]

# Map tool names to functions
TOOL_FUNCTIONS = {
    "search_anime_cache": search_anime_cache,
    "search_anime": search_anime,
    "get_anime_schedule": get_anime_schedule,
    "predict_completion": predict_completion,
    "get_season_anime": get_season_anime,
    "get_bingeable_anime": get_bingeable_anime,
}