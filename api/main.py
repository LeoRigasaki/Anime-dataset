"""FastAPI backend for anime catalog and schedule data."""
import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Simple in-memory cache for API responses
_api_cache: dict[str, tuple[float, dict]] = {}
_API_CACHE_TTL = 120

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

from src.supabase_client import get_supabase_client
from src.supabase_tools import get_season_anime, get_weekly_schedule, search_anime


def _get_current_season() -> tuple[str, int]:
    """Get current anime season and year."""
    today = date.today()
    month = today.month
    year = today.year
    if month in (1, 2, 3):
        return "WINTER", year
    if month in (4, 5, 6):
        return "SPRING", year
    if month in (7, 8, 9):
        return "SUMMER", year
    return "FALL", year


def _get_db_ready() -> bool:
    """Check whether Supabase is configured and reachable."""
    try:
        client = get_supabase_client()
        return client.health_check()
    except Exception as exc:
        print(f"Database health check failed: {exc}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Report database availability on startup."""
    if _get_db_ready():
        print("Supabase catalog backend ready")
    else:
        print("Supabase unavailable, catalog routes may fall back to CSV/API data")
    yield


app = FastAPI(
    title="Anime Schedule API",
    description="Anime catalog, schedule, and Supabase-backed dataset sync endpoints",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://frontend-ivory-omega-89.vercel.app",
        "https://frontend-riorigasaki65-gmailcoms-projects.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str


class AnimeData(BaseModel):
    anime_id: int
    title: str
    cover_image: Optional[str] = None
    status: Optional[str] = None
    predicted_completion: Optional[str] = None
    score: Optional[float] = None
    episodes: Optional[int] = None
    current_episode: Optional[int] = None
    genres: Optional[list[str]] = None
    synopsis: Optional[str] = None
    is_adult: Optional[bool] = None


class QueryResponse(BaseModel):
    response: str
    success: bool
    anime: list[AnimeData] = []


@app.get("/health")
async def health_check():
    db_ready = _get_db_ready()
    return {
        "status": "ok" if db_ready else "degraded",
        "db_ready": db_ready,
        # Kept for compatibility with the existing frontend health check.
        "agent_ready": db_ready,
        "query_enabled": False,
    }


@app.post("/query", response_model=QueryResponse)
async def query_agent(request: QueryRequest):
    """Compatibility endpoint after removing the AI agent."""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    return QueryResponse(
        response="AI chat has been removed from this build. Use Browse or Schedule instead.",
        success=False,
        anime=[],
    )


@app.get("/anime/seasonal")
async def get_seasonal(season: Optional[str] = None, year: Optional[int] = None):
    """Get all anime from a season. Cached for 2 minutes."""
    if not season or not year:
        season, year = _get_current_season()

    cache_key = f"seasonal_{season}_{year}"

    if cache_key in _api_cache:
        cached_time, cached_data = _api_cache[cache_key]
        if time.time() - cached_time < _API_CACHE_TTL:
            return JSONResponse(
                content=cached_data,
                headers={"X-Cache": "HIT", "Cache-Control": "max-age=120"}
            )

    try:
        anime_list = get_season_anime(season, year)
        result = {"season": f"{season} {year}", "anime": anime_list}
        _api_cache[cache_key] = (time.time(), result)
        return JSONResponse(
            content=result,
            headers={"X-Cache": "MISS", "Cache-Control": "max-age=120"}
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/anime/schedule/weekly")
async def get_weekly(weeks_offset: int = 0):
    """Get weekly airing schedule grouped by day."""
    cache_key = f"weekly_{weeks_offset}"

    if cache_key in _api_cache:
        cached_time, cached_data = _api_cache[cache_key]
        if time.time() - cached_time < _API_CACHE_TTL:
            return JSONResponse(
                content=cached_data,
                headers={"X-Cache": "HIT", "Cache-Control": "max-age=120"}
            )

    try:
        schedule_data = get_weekly_schedule(weeks_offset)
        _api_cache[cache_key] = (time.time(), schedule_data)
        return JSONResponse(
            content=schedule_data,
            headers={"X-Cache": "MISS", "Cache-Control": "max-age=120"}
        )
    except Exception as exc:
        print(f"Error fetching weekly schedule: {exc}")
        return JSONResponse(
            content={
                "week_start": "",
                "week_end": "",
                "week_label": "Error loading schedule",
                "total_schedules": 0,
                "schedule": {},
                "days_with_anime": [],
                "error": str(exc)
            },
            status_code=200,
            headers={"X-Cache": "ERROR"}
        )


@app.get("/anime/search/{query}")
async def search_anime_endpoint(query: str):
    """Search for a specific anime."""
    try:
        return search_anime(query)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/")
async def root():
    return {
        "name": "Anime Schedule API",
        "endpoints": {
            "POST /query": "Compatibility endpoint after removing AI chat",
            "GET /anime/seasonal": "Get seasonal anime",
            "GET /anime/schedule/weekly": "Get weekly airing schedule",
            "GET /anime/search/{query}": "Search for anime",
            "GET /health": "Health check",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
