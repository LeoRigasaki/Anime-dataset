"""Tools for the AnimeScheduleAgent."""
import asyncio
from datetime import date, datetime, timedelta
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
    
    # Already in async context - create new loop in thread
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(asyncio.run, coro)
        return future.result()


def _load_latest_csv(pattern: str) -> Optional[pd.DataFrame]:
    """Load the most recent CSV matching pattern."""
    if not DATA_DIR.exists():
        return None
    files = sorted(DATA_DIR.glob(pattern), reverse=True)
    if not files:
        return None
    return pd.read_csv(files[0])


def _calculate_completion_date(
    current_ep: Optional[int],
    total_eps: Optional[int],
    status: str,
    end_date: Optional[str] = None
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
        
        days_until_complete = remaining * 7
        predicted = date.today() + timedelta(days=days_until_complete)
        
        confidence = "high" if remaining <= 4 else "medium" if remaining <= 8 else "low"
        reason = f"{remaining} episodes remaining (assuming weekly releases)"
        
        return predicted, confidence, reason
    
    return None, "unknown", f"Unknown status: {status}"


# === TOOL FUNCTIONS ===

def search_anime_cache(query: str) -> list[dict]:
    """
    Search for anime by title in cached CSV data.
    Use this for quick lookups without API calls.
    
    Args:
        query: Anime title to search for (partial match supported)
    
    Returns:
        List of matching anime with basic info
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
    
    Args:
        query: Anime title to search for
    
    Returns:
        Anime details including current episode and next airing info
    """
    result = _run_async(search_anime_live(query))
    if result:
        result["source"] = "live"
    return result or {"error": f"No anime found matching '{query}'"}


def get_anime_schedule(anime_id: int) -> dict:
    """
    Get detailed schedule info for an anime by its AniList ID.
    Includes next episode timing and airing schedule.
    
    Args:
        anime_id: AniList anime ID
    
    Returns:
        Detailed anime info with schedule data
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
    end_date: Optional[str] = None
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
    
    Returns:
        Prediction with completion date and confidence
    """
    predicted_date, confidence, reason = _calculate_completion_date(
        current_episode, total_episodes, status, end_date
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
    Get all anime from a specific season.
    
    Args:
        season: Season name (Winter, Spring, Summer, Fall)
        year: Year (e.g., 2025)
    
    Returns:
        List of anime with their current status and predictions
    """
    anime_list = _run_async(get_seasonal_anime(season, year))
    
    # Add predictions to each anime
    results = []
    for anime in anime_list:
        prediction = predict_completion(
            anime_id=anime["anime_id"],
            title=anime["title"],
            status=anime["status"],
            current_episode=anime.get("current_episode"),
            total_episodes=anime.get("episodes"),
            end_date=anime.get("end_date")
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
    
    Args:
        season: Season name (Winter, Spring, Summer, Fall)
        year: Year (e.g., 2025)
        by_date: Optional cutoff date (YYYY-MM-DD). If not provided, returns only finished anime.
    
    Returns:
        List of bingeable anime sorted by completion date
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
                "end_date": {"type": "string", "description": "Known end date (YYYY-MM-DD)"}
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