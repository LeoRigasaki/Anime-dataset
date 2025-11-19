import pandas as pd
import os
from datetime import datetime, timezone
from typing import Optional, Dict

class AnimeScheduleManager:
    def __init__(self, data_dir: str = 'data/raw'):
        """Initialize the schedule manager."""
        self.airing_df = None
        self.airing_map = {}
        self.episode_map = {}
        self._load_airing_data(data_dir)
        
    def _load_airing_data(self, data_dir: str):
        """Load airing anime data if available."""
        airing_file = os.path.join(data_dir, 'airing_anime.csv')
        if os.path.exists(airing_file):
            try:
                self.airing_df = pd.read_csv(airing_file)
                print(f"✅ Loaded {len(self.airing_df)} airing anime from {airing_file}")
                
                # Create mappings
                self.airing_map = dict(zip(self.airing_df['anime_id'], self.airing_df['next_airing_episode_at']))
                self.episode_map = dict(zip(self.airing_df['anime_id'], self.airing_df['next_episode_number']))
            except Exception as e:
                print(f"⚠️ Could not load airing data: {e}")
                self.airing_df = None
        else:
            self.airing_df = None

    def get_airing_info(self, anime_id: int) -> Dict[str, int]:
        """Get airing info for a specific anime ID."""
        return {
            'next_airing_at': self.airing_map.get(anime_id, 0),
            'next_episode': self.episode_map.get(anime_id, 0)
        }

    def format_countdown(self, timestamp: int) -> str:
        """Format a timestamp into a countdown string."""
        if not timestamp or timestamp == 0:
            return ""
            
        now = datetime.now(timezone.utc).timestamp()
        diff = timestamp - now
        
        if diff < 0:
            return "Aired recently"
            
        days = int(diff // 86400)
        hours = int((diff % 86400) // 3600)
        minutes = int((diff % 3600) // 60)
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
            
        return " ".join(parts)
    
    def predict_completion_date(self, next_airing_ts: int, current_ep: int, total_eps: int) -> str:
        """Predict the completion date based on weekly airing schedule."""
        if not next_airing_ts or not total_eps or total_eps == 0:
            return ""
            
        remaining_eps = total_eps - current_ep
        if remaining_eps <= 0:
            return "Completed?"
            
        # Assuming weekly release (7 days * 24 hours * 3600 seconds)
        seconds_per_week = 7 * 24 * 3600
        completion_ts = next_airing_ts + ((remaining_eps - 1) * seconds_per_week)
        
        completion_date = datetime.fromtimestamp(completion_ts, tz=timezone.utc)
        return completion_date.strftime("%Y-%m-%d")
