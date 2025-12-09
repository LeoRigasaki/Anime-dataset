"""AniList GraphQL client for live anime data."""
import asyncio
import time
import httpx
from datetime import datetime, timezone
from typing import Optional

ANILIST_URL = "https://graphql.anilist.co"

# Rate limiting
_last_request_time = 0
_MIN_REQUEST_INTERVAL = 0.7  # ~85 requests/min max


async def _rate_limit():
    """Enforce rate limiting between API calls."""
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        await asyncio.sleep(_MIN_REQUEST_INTERVAL - elapsed)
    _last_request_time = time.time()


# GraphQL query for anime details with FULL airing info
ANIME_QUERY = """
query ($id: Int, $search: String) {
  Media(id: $id, search: $search, type: ANIME) {
    id
    title { romaji english native }
    status
    episodes
    nextAiringEpisode { episode airingAt timeUntilAiring }
    airingSchedule(notYetAired: true, perPage: 25) {
      nodes { episode airingAt }
    }
    startDate { year month day }
    endDate { year month day }
    season
    seasonYear
    genres
    averageScore
    coverImage { large medium }
    bannerImage
    studios(isMain: true) { nodes { name } }
  }
}
"""

# Query for seasonal anime
SEASONAL_QUERY = """
query ($season: MediaSeason, $year: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage currentPage }
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      id
      title { romaji english }
      status
      episodes
      nextAiringEpisode { episode airingAt timeUntilAiring }
      airingSchedule(notYetAired: true, perPage: 25) {
        nodes { episode airingAt }
      }
      startDate { year month day }
      endDate { year month day }
      averageScore
      coverImage { large medium }
    }
  }
}
"""


def _format_countdown(seconds: int) -> str:
    """Convert seconds to human-readable countdown."""
    if seconds <= 0:
        return "aired"
    days, remainder = divmod(seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes = remainder // 60
    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0 and days == 0:
        parts.append(f"{minutes}m")
    return " ".join(parts) if parts else "< 1m"


def _parse_date(date_obj: Optional[dict]) -> Optional[str]:
    """Parse AniList date object to ISO string."""
    if not date_obj or not date_obj.get("year"):
        return None
    year = date_obj["year"]
    month = date_obj.get("month") or 1
    day = date_obj.get("day") or 1
    return f"{year}-{month:02d}-{day:02d}"


async def search_anime_live(search: str) -> Optional[dict]:
    """Search for anime by title using AniList API."""
    await _rate_limit()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                ANILIST_URL,
                json={"query": ANIME_QUERY, "variables": {"search": search}}
            )
            resp.raise_for_status()
            data = resp.json()
            media = data.get("data", {}).get("Media")
            if not media:
                return None
            return _transform_media(media)
        except Exception as e:
            return {"error": str(e)}


async def get_anime_by_id(anime_id: int) -> Optional[dict]:
    """Get anime details by AniList ID."""
    await _rate_limit()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(
                ANILIST_URL,
                json={"query": ANIME_QUERY, "variables": {"id": anime_id}}
            )
            resp.raise_for_status()
            data = resp.json()
            media = data.get("data", {}).get("Media")
            if not media:
                return None
            return _transform_media(media)
        except Exception as e:
            return {"error": str(e)}


async def get_seasonal_anime(season: str, year: int) -> list[dict]:
    """Get all anime for a given season."""
    season_map = {"WINTER": "WINTER", "SPRING": "SPRING", "SUMMER": "SUMMER", "FALL": "FALL"}
    season_upper = season.upper()
    if season_upper not in season_map:
        return []
    
    results = []
    page = 1
    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            await _rate_limit()
            try:
                resp = await client.post(
                    ANILIST_URL,
                    json={
                        "query": SEASONAL_QUERY,
                        "variables": {"season": season_upper, "year": year, "page": page}
                    }
                )
                resp.raise_for_status()
                data = resp.json()
                page_data = data.get("data", {}).get("Page", {})
                media_list = page_data.get("media", [])
                
                for media in media_list:
                    results.append(_transform_media(media))
                
                if not page_data.get("pageInfo", {}).get("hasNextPage"):
                    break
                page += 1
                if page > 5:  # Safety limit
                    break
            except Exception:
                break
    return results


def _transform_media(media: dict) -> dict:
    """Transform AniList media object to our format."""
    title_obj = media.get("title", {})
    title = title_obj.get("english") or title_obj.get("romaji") or "Unknown"
    
    next_ep = media.get("nextAiringEpisode")
    next_episode_info = None
    next_airing_at = None
    
    if next_ep:
        next_airing_at = next_ep.get("airingAt")
        next_episode_info = {
            "number": next_ep.get("episode"),
            "airs_at": datetime.fromtimestamp(next_ep["airingAt"], tz=timezone.utc).isoformat() if next_airing_at else None,
            "airs_in_human": _format_countdown(next_ep.get("timeUntilAiring", 0)),
            "airs_at_timestamp": next_airing_at
        }
    
    # Extract full airing schedule if available
    airing_schedule = media.get("airingSchedule", {}).get("nodes", [])
    last_scheduled_episode = None
    predicted_end_from_schedule = None
    full_schedule = []

    if airing_schedule:
        # Sort by episode number to get chronological schedule
        sorted_schedule = sorted(airing_schedule, key=lambda x: x.get("episode", 0))

        # Build full schedule with readable dates
        for ep in sorted_schedule:
            if ep.get("episode") and ep.get("airingAt"):
                full_schedule.append({
                    "episode": ep["episode"],
                    "airs_at": datetime.fromtimestamp(ep["airingAt"], tz=timezone.utc).strftime("%Y-%m-%d"),
                    "airs_at_timestamp": ep["airingAt"]
                })

        # Get the last scheduled episode (highest episode number)
        if full_schedule:
            last_ep = full_schedule[-1]
            last_scheduled_episode = last_ep["episode"]
            predicted_end_from_schedule = last_ep["airs_at"]
    
    studios = media.get("studios", {}).get("nodes", [])
    studio_names = [s["name"] for s in studios if s.get("name")]
    
    # Get cover image
    cover = media.get("coverImage", {})
    cover_image = cover.get("large") or cover.get("medium")
    
    return {
        "anime_id": media["id"],
        "title": title,
        "title_romaji": title_obj.get("romaji"),
        "status": media.get("status", "UNKNOWN"),
        "episodes": media.get("episodes"),
        "current_episode": (next_ep["episode"] - 1) if next_ep and next_ep.get("episode") else media.get("episodes"),
        "next_episode": next_episode_info,
        "next_airing_at": next_airing_at,  # Unix timestamp for calculations
        "start_date": _parse_date(media.get("startDate")),
        "end_date": _parse_date(media.get("endDate")),
        "season": media.get("season"),
        "season_year": media.get("seasonYear"),
        "genres": media.get("genres", []),
        "score": media.get("averageScore"),
        "studios": studio_names,
        "cover_image": cover_image,
        "banner_image": media.get("bannerImage"),
        # New fields for better predictions
        "last_scheduled_episode": last_scheduled_episode,
        "predicted_end_from_schedule": predicted_end_from_schedule,
        "airing_schedule": full_schedule,  # Full episode schedule
    }