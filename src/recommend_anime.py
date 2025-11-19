import pandas as pd
import sys
from typing import List, Dict, Tuple
from collections import Counter
from datetime import datetime, timezone
import os
from schedule_manager import AnimeScheduleManager

class AnimeRecommendationSystem:
    def __init__(self, csv_file_path: str):
        """Initialize the recommendation system with anime data."""
        try:
            self.df = pd.read_csv(csv_file_path)
            print(f"✅ Loaded {len(self.df)} anime from {csv_file_path}")
            
            # Initialize schedule manager
            self.schedule_manager = AnimeScheduleManager()
            self.airing_df = self.schedule_manager.airing_df
                
            self._preprocess_data()
        except FileNotFoundError:
            print(f"❌ Error: Could not find file '{csv_file_path}'")
            sys.exit(1)
        except Exception as e:
            print(f"❌ Error loading data: {e}")
            sys.exit(1)
    
    def _preprocess_data(self):
        """Clean and preprocess the anime data."""
        # Fill NaN values
        self.df['genres'] = self.df['genres'].fillna('')
        self.df['tags'] = self.df['tags'].fillna('')
        self.df['members'] = self.df['members'].fillna(0)
        self.df['score'] = self.df['score'].fillna(0)
        
        # Merge airing data if available
        if self.airing_df is not None:
            # Create a mapping of anime_id to next_airing_episode_at
            airing_map = dict(zip(self.airing_df['anime_id'], self.airing_df['next_airing_episode_at']))
            episode_map = dict(zip(self.airing_df['anime_id'], self.airing_df['next_episode_number']))
            
            self.df['next_airing_episode_at'] = self.df['anime_id'].map(airing_map).fillna(0)
            self.df['next_episode_number'] = self.df['anime_id'].map(episode_map).fillna(0)
        elif 'next_airing_episode_at' not in self.df.columns:
            self.df['next_airing_episode_at'] = 0
            self.df['next_episode_number'] = 0
            
        self.df['next_airing_episode_at'] = self.df['next_airing_episode_at'].fillna(0)
        
        # Create lowercase versions for matching
        self.df['title_lower'] = self.df['title'].str.lower()
        
        print(f"✅ Data preprocessed successfully")
    
    def search_anime(self, search_term: str) -> List[Dict]:
        """Search for anime by title."""
        search_term = search_term.lower().strip()
        
        # Exact match first
        exact_matches = self.df[self.df['title_lower'] == search_term]
        if not exact_matches.empty:
            return self._format_search_results(exact_matches)
        
        # Contains match
        contains_matches = self.df[self.df['title_lower'].str.contains(search_term, na=False)]
        if not contains_matches.empty:
            return self._format_search_results(contains_matches.head(10))
        
        return []
    
    def _format_search_results(self, matches_df: pd.DataFrame) -> List[Dict]:
        """Format search results for display."""
        results = []
        for _, anime in matches_df.iterrows():
            results.append({
                'index': anime.name,
                'title': anime['title'],
                'score': anime['score'],
                'members': int(anime['members']) if pd.notna(anime['members']) else 0,
                'type': anime.get('type', 'Unknown'),
                'episodes': anime.get('episodes', 'Unknown'),
                'genres': anime['genres'],
                'tags': anime['tags'],
                'next_airing_at': anime.get('next_airing_episode_at', 0),
                'next_episode_num': anime.get('next_episode_number', 0)
            })
        return results
    
    def get_maximum_similarity_recommendations(
        self, 
        target_anime_index: int, 
        top_n: int = 10,
        min_members: int = 1000,
        min_score: float = 60.0,
        exclude_sequels: bool = True
    ) -> List[Dict]:
        """
        Get recommendations based on maximum genre + tag similarity.
        
        Args:
            target_anime_index: Index of target anime in dataframe
            top_n: Number of recommendations to return
            min_members: Minimum member count for recommendations
            min_score: Minimum score for recommendations
            exclude_sequels: Whether to exclude sequels/related anime
        """
        target_anime = self.df.iloc[target_anime_index]
        
        if pd.isna(target_anime['genres']) or pd.isna(target_anime['tags']):
            print("❌ Target anime missing genre or tag data")
            return []
        
        # Parse target anime attributes
        target_genres = [g.strip().lower() for g in str(target_anime['genres']).split(';') if g.strip()]
        target_tags = [t.strip().lower() for t in str(target_anime['tags']).split(';') if t.strip()]
        target_title_words = set(str(target_anime['title']).lower().split())
        
        print(f"\n🎯 TARGET ANIME: {target_anime['title']}")
        
        # Display next episode info if available
        # Display next episode info if available
        next_airing = target_anime.get('next_airing_episode_at', 0)
        if next_airing > 0:
            countdown = self.schedule_manager.format_countdown(next_airing)
            ep_num = int(target_anime.get('next_episode_number', 0))
            ep_str = f"Ep {ep_num}" if ep_num > 0 else "Next Ep"
            print(f"   📅 {ep_str}: {countdown}")
            
            # Predict completion for target
            total_eps = target_anime.get('episodes')
            if total_eps and pd.notna(total_eps):
                try:
                    total_eps = int(float(total_eps))
                    completion_date = self.schedule_manager.predict_completion_date(next_airing, ep_num, total_eps)
                    if completion_date:
                        print(f"   🏁 Predicted Completion: {completion_date}")
                except (ValueError, TypeError):
                    pass

        print(f"📊 Genres ({len(target_genres)}): {', '.join(target_genres)}")
        print(f"🏷️  Tags ({len(target_tags)}): {', '.join(target_tags[:8])}{'...' if len(target_tags) > 8 else ''}")
        
        recommendations = []
        
        for idx, anime in self.df.iterrows():
            # Skip target anime itself
            if idx == target_anime_index:
                continue
            
            # Apply filters
            if pd.isna(anime['genres']) or pd.isna(anime['tags']):
                continue
            if anime['members'] < min_members or anime['score'] < min_score:
                continue
            
            # Exclude sequels/related anime if requested
            if exclude_sequels:
                anime_title_words = set(str(anime['title']).lower().split())
                if len(target_title_words.intersection(anime_title_words)) >= 2:
                    continue
            
            # Parse anime attributes
            anime_genres = [g.strip().lower() for g in str(anime['genres']).split(';') if g.strip()]
            anime_tags = [t.strip().lower() for t in str(anime['tags']).split(';') if t.strip()]
            
            # Calculate similarity
            shared_genres = [g for g in target_genres if g in anime_genres]
            shared_tags = [t for t in target_tags if t in anime_tags]
            
            total_target_elements = len(target_genres) + len(target_tags)
            total_shared_elements = len(shared_genres) + len(shared_tags)
            
            if total_shared_elements == 0:
                continue
            
            # Calculate percentages
            genre_match_pct = (len(shared_genres) / len(target_genres)) * 100 if target_genres else 0
            tag_match_pct = (len(shared_tags) / len(target_tags)) * 100 if target_tags else 0
            overall_match_pct = (total_shared_elements / total_target_elements) * 100
            
            # Priority scoring
            priority_score = 0
            
            # ULTIMATE: All genres + 80%+ tags
            if len(shared_genres) == len(target_genres) and len(shared_tags) >= len(target_tags) * 0.8:
                priority_score = 10000
            # HIGH: All genres + 60%+ tags
            elif len(shared_genres) == len(target_genres) and len(shared_tags) >= len(target_tags) * 0.6:
                priority_score = 9000
            # GOOD: All genres + some tags
            elif len(shared_genres) == len(target_genres):
                priority_score = 8000
            # DECENT: Good overall match
            elif total_shared_elements >= total_target_elements * 0.6:
                priority_score = 7000
            # OKAY: Some similarity
            elif total_shared_elements >= total_target_elements * 0.4:
                priority_score = 6000
            
            # Additional scoring
            absolute_match_score = (len(shared_genres) * 100) + (len(shared_tags) * 10)
            quality_bonus = anime['score']
            popularity_bonus = min(anime['members'] / 10000, 50)  # Cap bonus
            
            final_score = priority_score + absolute_match_score + quality_bonus + popularity_bonus
            
            recommendations.append({
                'anime': anime,
                'shared_genres': shared_genres,
                'shared_tags': shared_tags,
                'total_shared_elements': total_shared_elements,
                'genre_match_pct': genre_match_pct,
                'tag_match_pct': tag_match_pct,
                'overall_match_pct': overall_match_pct,
                'final_score': final_score,
                'priority_tier': self._get_priority_tier(total_shared_elements, total_target_elements)
            })
        
        # Sort by total shared elements first, then by final score
        recommendations.sort(key=lambda x: (-x['total_shared_elements'], -x['final_score']))
        
        return recommendations[:top_n]
    
    def _get_priority_tier(self, shared_elements: int, total_elements: int) -> str:
        """Determine priority tier based on shared elements."""
        match_ratio = shared_elements / total_elements if total_elements > 0 else 0
        
        if match_ratio >= 0.8:
            return "🏆 ULTIMATE MATCH"
        elif match_ratio >= 0.7:
            return "⭐ PREMIUM MATCH"
        elif match_ratio >= 0.6:
            return "✨ HIGH MATCH"
        elif match_ratio >= 0.4:
            return "💫 GOOD MATCH"
        else:
            return "📍 DECENT MATCH"
    
            return "📍 DECENT MATCH"
            
    def display_recommendations(self, recommendations: List[Dict], target_elements: int):
        """Display recommendations in a formatted way."""
        if not recommendations:
            print("❌ No recommendations found with current criteria.")
            return
        
        print(f"\n📊 TOP {len(recommendations)} MAXIMUM SIMILARITY RECOMMENDATIONS:")
        print("=" * 70)
        
        for i, rec in enumerate(recommendations, 1):
            anime = rec['anime']
            
            print(f"{i}. {rec['priority_tier']}")
            print(f"   \"{anime['title']}\"")
            print(f"   Score: {anime['score']} | Members: {int(anime['members']):,} | "
                  f"Type: {anime.get('type', 'Unknown')} ({anime.get('episodes', '?')} eps)")
            
            next_airing = anime.get('next_airing_episode_at', 0)
            if next_airing > 0:
                countdown = self.schedule_manager.format_countdown(next_airing)
                ep_num = int(anime.get('next_episode_number', 0))
                ep_str = f"Ep {ep_num}" if ep_num > 0 else "Next Ep"
                print(f"   📅 {ep_str}: {countdown}")
                
                # Predict completion
                total_eps = anime.get('episodes')
                if total_eps and total_eps != 'Unknown' and total_eps != 'nan':
                    try:
                        total_eps = int(float(total_eps))
                        completion_date = self.schedule_manager.predict_completion_date(next_airing, ep_num, total_eps)
                        if completion_date:
                            print(f"   🏁 Predicted Completion: {completion_date}")
                    except (ValueError, TypeError):
                        pass
                
            print(f"   TOTAL SHARED: {rec['total_shared_elements']}/{target_elements} elements "
                  f"({rec['overall_match_pct']:.1f}%)")
            print(f"   Shared Genres ({len(rec['shared_genres'])}): [{', '.join(rec['shared_genres'])}]")
            print(f"   Shared Tags ({len(rec['shared_tags'])}): [{', '.join(rec['shared_tags'][:8])}{'...' if len(rec['shared_tags']) > 8 else ''}]")
            print(f"   All Genres: {anime['genres']}")
            print()


def get_user_preferences():
    """Get user preferences through terminal input."""
    print("🎌 ANIME RECOMMENDATION SYSTEM")
    print("=" * 40)
    
    # Get CSV file path
    default_file = "anilist_seasonal_20250527.csv"
    csv_file = input(f"📁 Enter CSV file path (default: {default_file}): ").strip()
    if not csv_file:
        csv_file = default_file
    
    # Get recommendation parameters
    print("\n⚙️  RECOMMENDATION SETTINGS:")
    
    try:
        top_n = input("🔢 Number of recommendations (default: 10): ").strip()
        top_n = int(top_n) if top_n else 10
        
        min_members = input("👥 Minimum member count (default: 1000): ").strip()
        min_members = int(min_members) if min_members else 1000
        
        min_score = input("⭐ Minimum score (default: 60): ").strip()
        min_score = float(min_score) if min_score else 60.0
        
        exclude_sequels = input("🚫 Exclude sequels/related anime? (y/n, default: y): ").strip().lower()
        exclude_sequels = exclude_sequels != 'n'
        
    except ValueError:
        print("❌ Invalid input. Using default values.")
        top_n, min_members, min_score, exclude_sequels = 10, 1000, 60.0, True
    
    return {
        'csv_file': csv_file,
        'top_n': top_n,
        'min_members': min_members,
        'min_score': min_score,
        'exclude_sequels': exclude_sequels
    }


def main():
    """Main function to run the recommendation system."""
    try:
        # Get user preferences
        prefs = get_user_preferences()
        
        # Initialize recommendation system
        print(f"\n📚 Loading anime database...")
        rec_system = AnimeRecommendationSystem(prefs['csv_file'])
        
        while True:
            print(f"\n🔍 ANIME SEARCH")
            print("-" * 20)
            
            # Get target anime
            search_term = input("Enter anime title to search for: ").strip()
            if not search_term:
                print("❌ Please enter a valid anime title.")
                continue
            
            # Search for anime
            search_results = rec_system.search_anime(search_term)
            
            if not search_results:
                print(f"❌ No anime found matching '{search_term}'")
                retry = input("Try another search? (y/n): ").strip().lower()
                if retry != 'y':
                    break
                continue
            
            # Display search results
            print(f"\n📋 SEARCH RESULTS for '{search_term}':")
            print("-" * 40)
            
            for i, anime in enumerate(search_results):
                print(f"{i+1}. \"{anime['title']}\"")
                print(f"   Score: {anime['score']} | Members: {int(anime['members']):,} | "
                      f"Type: {anime['type']} ({anime['episodes']} eps)")
                
                next_airing = anime.get('next_airing_at', 0)
                if next_airing > 0:
                    countdown = rec_system.schedule_manager.format_countdown(next_airing)
                    ep_num = int(anime.get('next_episode_num', 0))
                    ep_str = f"Ep {ep_num}" if ep_num > 0 else "Next Ep"
                    print(f"   📅 {ep_str}: {countdown}")
                    
                print(f"   Genres: {anime['genres']}")
                print()
            
            # Get user selection
            try:
                choice = input(f"Select anime (1-{len(search_results)}) or 's' for new search: ").strip()
                
                if choice.lower() == 's':
                    continue
                
                choice_idx = int(choice) - 1
                if choice_idx < 0 or choice_idx >= len(search_results):
                    print("❌ Invalid selection.")
                    continue
                
                selected_anime = search_results[choice_idx]
                target_anime_index = selected_anime['index']
                
            except ValueError:
                print("❌ Invalid input.")
                continue
            
            # Get recommendations
            print(f"\n🤖 Generating recommendations for \"{selected_anime['title']}\"...")
            
            recommendations = rec_system.get_maximum_similarity_recommendations(
                target_anime_index=target_anime_index,
                top_n=prefs['top_n'],
                min_members=prefs['min_members'],
                min_score=prefs['min_score'],
                exclude_sequels=prefs['exclude_sequels']
            )
            
            # Calculate target elements for display
            target_anime = rec_system.df.iloc[target_anime_index]
            target_genres = len([g for g in str(target_anime['genres']).split(';') if g.strip()])
            target_tags = len([t for t in str(target_anime['tags']).split(';') if t.strip()])
            target_elements = target_genres + target_tags
            
            # Display recommendations
            rec_system.display_recommendations(recommendations, target_elements)
            
            # Ask for another recommendation
            another = input(f"\n🔄 Get recommendations for another anime? (y/n): ").strip().lower()
            if another != 'y':
                break
        
        print("\n👋 Thank you for using the Anime Recommendation System!")
        
    except KeyboardInterrupt:
        print("\n\n👋 Goodbye!")
    except Exception as e:
        print(f"\n❌ An error occurred: {e}")


if __name__ == "__main__":
    main()