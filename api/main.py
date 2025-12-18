"""FastAPI backend for AnimeScheduleAgent."""
import os
import sys
import re
from contextlib import asynccontextmanager
from typing import Optional
from datetime import date, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

from src.agent import AnimeScheduleAgent
from src.tools import get_season_anime, search_anime, get_weekly_schedule

# Global agent instance
agent: Optional[AnimeScheduleAgent] = None


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


def _extract_anime_names_from_text(text: str) -> list[str]:
    """
    Extract potential anime titles from response text.
    Looks for capitalized phrases that could be anime names.
    """
    # Pattern to find quoted text or capitalized multi-word phrases
    patterns = [
        r'"([^"]+)"',  # Quoted text
        r"'([^']+)'",  # Single quoted text
        r'\b([A-Z][A-Za-z0-9\s:!?\-]+(?:Season|Arc|Part|Movie|OVA|Special|TV|Film)\s*\d*)\b',  # Titles with keywords
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b',  # Capitalized multi-word phrases
    ]

    potential_names = set()
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            # Clean up the match
            name = match.strip()
            # Filter out common false positives and short names
            if len(name) > 3 and not name.lower().startswith(('http', 'www', 'the ')):
                # Exclude common words that aren't anime
                exclude_words = {'Winter', 'Spring', 'Summer', 'Fall', 'January', 'February', 'March',
                                'April', 'May', 'June', 'July', 'August', 'September', 'October',
                                'November', 'December', 'Today', 'Tomorrow', 'Next Week', 'This Week'}
                if name not in exclude_words:
                    potential_names.add(name)

    return list(potential_names)


def _search_and_enrich_anime(response_text: str, existing_anime: list[dict]) -> list[dict]:
    """
    Search for anime mentioned in response text and add them if not already present.
    """
    existing_ids = {anime.get('anime_id') for anime in existing_anime}
    potential_names = _extract_anime_names_from_text(response_text)
    enriched_anime = existing_anime.copy()

    for name in potential_names:
        try:
            # Search for this anime
            result = search_anime(name)

            # If we got a result and it's not already in our list
            if isinstance(result, dict) and result.get('anime_id'):
                if result['anime_id'] not in existing_ids:
                    # Add it to our enriched list
                    anime_entry = {
                        'anime_id': result['anime_id'],
                        'title': result.get('title', name),
                        'cover_image': result.get('cover_image'),
                        'status': result.get('status'),
                        'predicted_completion': result.get('predicted_completion'),
                        'score': result.get('score'),
                        'episodes': result.get('episodes'),
                        'current_episode': result.get('current_episode'),
                        'genres': result.get('genres'),
                        'synopsis': result.get('synopsis'),
                        'is_adult': result.get('is_adult'),
                    }
                    # Remove None values
                    anime_entry = {k: v for k, v in anime_entry.items() if v is not None}
                    enriched_anime.append(anime_entry)
                    existing_ids.add(result['anime_id'])
        except Exception as e:
            # If search fails for this name, just continue with others
            print(f"Warning: Failed to search for '{name}': {e}")
            continue

    return enriched_anime


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize agent on startup."""
    global agent
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("⚠️  WARNING: GOOGLE_API_KEY not set. Agent queries will fail.")
    else:
        agent = AnimeScheduleAgent(api_key=api_key)
        print("✅ AnimeScheduleAgent initialized")
    yield


app = FastAPI(
    title="AnimeScheduleAgent API",
    description="AI-powered anime completion predictions",
    version="1.0.0",
    lifespan=lifespan
)

# Allow Next.js frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://frontend-ivory-omega-89.vercel.app",
        "https://frontend-riorigasaki65-gmailcoms-projects.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",  # Allow all Vercel preview URLs
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
    return {"status": "ok", "agent_ready": agent is not None}


@app.post("/query", response_model=QueryResponse)
async def query_agent(request: QueryRequest):
    """Send a natural language query to the agent."""
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized. Check GOOGLE_API_KEY.")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        response, anime_data = agent.query_with_data(request.query)

        # Enrich anime data by searching for anime names mentioned in the response
        enriched_anime = _search_and_enrich_anime(response, anime_data)

        return QueryResponse(response=response, success=True, anime=enriched_anime)
    except AttributeError:
        # Fallback if agent doesn't have new method
        response = agent.query(request.query)
        # Still try to extract anime names from response
        enriched_anime = _search_and_enrich_anime(response, [])
        return QueryResponse(response=response, success=True, anime=enriched_anime)
    except Exception as e:
        return QueryResponse(response=f"Error: {str(e)}", success=False)


@app.get("/anime/seasonal")
async def get_seasonal(season: Optional[str] = None, year: Optional[int] = None):
    """Get all anime from a season with predictions."""
    if not season or not year:
        season, year = _get_current_season()

    try:
        anime_list = get_season_anime(season, year)
        return {"season": f"{season} {year}", "anime": anime_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/anime/schedule/weekly")
async def get_weekly(weeks_offset: int = 0):
    """
    Get all anime episodes airing in a specific week, grouped by day (AniChart-style).

    Args:
        weeks_offset: Number of weeks to offset (0 = current week, 1 = next week, -1 = last week)

    Returns:
        Weekly schedule grouped by day with airing times
    """
    try:
        schedule_data = get_weekly_schedule(weeks_offset)
        return schedule_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/anime/search/{query}")
async def search_anime_endpoint(query: str):
    """Search for a specific anime."""
    try:
        result = search_anime(query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    return {
        "name": "AnimeScheduleAgent API",
        "endpoints": {
            "POST /query": "Natural language query to agent",
            "GET /anime/seasonal": "Get seasonal anime with predictions",
            "GET /anime/schedule/weekly": "Get weekly airing schedule (AniChart-style)",
            "GET /anime/search/{query}": "Search specific anime",
            "GET /health": "Health check"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)