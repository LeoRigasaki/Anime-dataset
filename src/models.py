"""Pydantic models for structured agent responses."""
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field


class NextEpisode(BaseModel):
    """Info about the next airing episode."""
    number: int = Field(description="Episode number")
    airs_at: Optional[datetime] = Field(default=None, description="When it airs (UTC)")
    airs_in_human: Optional[str] = Field(default=None, description="Human readable countdown")


class AnimePrediction(BaseModel):
    """Prediction for a single anime's completion."""
    anime_id: int = Field(description="AniList anime ID")
    title: str = Field(description="Anime title")
    status: Literal["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"] = Field(
        description="Current airing status"
    )
    current_episode: Optional[int] = Field(default=None, description="Latest aired episode")
    total_episodes: Optional[int] = Field(default=None, description="Total planned episodes")
    predicted_completion: Optional[date] = Field(default=None, description="Predicted finish date")
    confidence: Literal["high", "medium", "low", "unknown"] = Field(
        description="Prediction confidence"
    )
    confidence_reason: str = Field(description="Why this confidence level")
    days_until_complete: Optional[int] = Field(default=None, description="Days until finished")
    next_episode: Optional[NextEpisode] = Field(default=None, description="Next episode info")
    is_bingeable: bool = Field(description="True if already finished airing")


class SeasonalSummary(BaseModel):
    """Summary of anime for a season."""
    season: str = Field(description="Season name (e.g., 'Fall 2025')")
    total_anime: int = Field(description="Total anime in season")
    already_finished: list[str] = Field(description="Titles already done")
    finishing_soon: list[AnimePrediction] = Field(description="Finishing within 2 weeks")
    still_airing: list[AnimePrediction] = Field(description="Still releasing")


class AgentResponse(BaseModel):
    """Wrapper for agent responses."""
    query_type: Literal["single_anime", "seasonal", "date_filter", "general"] = Field(
        description="What kind of query this was"
    )
    predictions: list[AnimePrediction] = Field(default_factory=list, description="Anime predictions")
    summary: str = Field(description="Human-readable summary of results")
    data_source: Literal["cache", "live", "both"] = Field(description="Where data came from")
