"""FastAPI backend for AnimeScheduleAgent."""
import os
import sys
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
from src.tools import get_bingeable_anime, get_season_anime, search_anime

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
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
        return QueryResponse(response=response, success=True, anime=anime_data)
    except AttributeError:
        # Fallback if agent doesn't have new method
        response = agent.query(request.query)
        return QueryResponse(response=response, success=True, anime=[])
    except Exception as e:
        return QueryResponse(response=f"Error: {str(e)}", success=False)


@app.get("/anime/bingeable")
async def get_bingeable(season: Optional[str] = None, year: Optional[int] = None, by_date: Optional[str] = None):
    """Get anime that are finished or finishing soon."""
    if not season or not year:
        season, year = _get_current_season()
    
    if not by_date:
        by_date = (date.today() + timedelta(days=30)).isoformat()
    
    try:
        anime_list = get_bingeable_anime(season, year, by_date)
        return {"season": f"{season} {year}", "by_date": by_date, "anime": anime_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
            "GET /anime/bingeable": "Get bingeable anime (with images)",
            "GET /anime/seasonal": "Get seasonal anime (with images)",
            "GET /anime/search/{query}": "Search specific anime",
            "GET /health": "Health check"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)