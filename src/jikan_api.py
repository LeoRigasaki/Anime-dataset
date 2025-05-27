import requests
import pandas as pd
from datetime import datetime
import time
import os
import json

# Jikan API v4 endpoint
JIKAN_BASE_URL = 'https://api.jikan.moe/v4'

def get_all_seasons(start_year=2000):
    """Generate all seasons from start_year to current year."""
    current_year = datetime.now().year
    seasons = ['winter', 'spring', 'summer', 'fall']
    all_seasons = []
    
    for year in range(start_year, current_year + 1):
        for season in seasons:
            all_seasons.append((year, season))
    
    return all_seasons

def fetch_seasonal_anime_jikan(year, season):
    """Fetch seasonal anime from Jikan API."""
    url = f'{JIKAN_BASE_URL}/seasons/{year}/{season}'
    
    try:
        print(f"Fetching {season} {year} anime from Jikan...")
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            anime_list = data.get('data', [])
            print(f"Retrieved {len(anime_list)} anime for {season} {year}")
            return anime_list
        elif response.status_code == 429:
            print(f"Rate limited for {season} {year}, waiting 60 seconds...")
            time.sleep(60)
            return fetch_seasonal_anime_jikan(year, season)  # Retry
        else:
            print(f"Error fetching {season} {year}: HTTP {response.status_code}")
            return []
            
    except Exception as e:
        print(f"Error fetching {season} {year}: {e}")
        return []

def fetch_anime_statistics(anime_id):
    """Fetch detailed statistics for a specific anime from Jikan."""
    url = f'{JIKAN_BASE_URL}/anime/{anime_id}/statistics'
    
    try:
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('data', {})
        elif response.status_code == 429:
            print(f"Rate limited for anime {anime_id}, waiting...")
            time.sleep(2)
            return None
        else:
            print(f"Error fetching stats for anime {anime_id}: HTTP {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Error fetching stats for anime {anime_id}: {e}")
        return None

def process_jikan_anime_data(raw_data, fetch_individual_stats=True, max_individual_requests=500):
    """Process raw Jikan anime data into standardized format."""
    processed_data = []
    individual_requests_made = 0
    
    for anime in raw_data:
        if not anime:
            continue
        
        # Extract basic information
        mal_id = anime.get('mal_id')
        titles = anime.get('titles', [])
        
        # Get different title variations
        english_title = ''
        japanese_title = ''
        for title in titles:
            if title.get('type') == 'English':
                english_title = title.get('title', '')
            elif title.get('type') == 'Japanese':
                japanese_title = title.get('title', '')
        
        # Get genres
        genres = [genre['name'] for genre in anime.get('genres', [])]
        
        # Get studios
        studios = [studio['name'] for studio in anime.get('studios', [])]
        
        # Get producers
        producers = [producer['name'] for producer in anime.get('producers', [])]
        
        # Extract dates
        aired = anime.get('aired', {})
        start_date = ''
        end_date = ''
        if aired.get('from'):
            start_date = aired['from'][:10]  # Extract YYYY-MM-DD
        if aired.get('to'):
            end_date = aired['to'][:10]
        
        # Initialize user interaction stats
        stats_data = {
            'watching': 0,
            'completed': 0,
            'on_hold': 0,
            'dropped': 0,
            'plan_to_watch': 0,
            'total': 0
        }
        
        # Fetch individual statistics if enabled and within limit
        if (fetch_individual_stats and 
            individual_requests_made < max_individual_requests and 
            mal_id):
            
            individual_stats = fetch_anime_statistics(mal_id)
            individual_requests_made += 1
            
            if individual_stats:
                stats_data['watching'] = individual_stats.get('watching', 0)
                stats_data['completed'] = individual_stats.get('completed', 0)
                stats_data['on_hold'] = individual_stats.get('on_hold', 0)
                stats_data['dropped'] = individual_stats.get('dropped', 0)
                stats_data['plan_to_watch'] = individual_stats.get('plan_to_watch', 0)
                stats_data['total'] = individual_stats.get('total', 0)
                
                print(f"✓ Fetched stats for {anime.get('title', 'Unknown')}: {stats_data['total']} total users")
            
            # Rate limiting between individual requests
            time.sleep(1)
        
        # Create processed anime entry
        anime_info = {
            'anime_id': mal_id,
            'title': anime.get('title', ''),
            'english_title': english_title,
            'japanese_title': japanese_title,
            'type': anime.get('type', ''),
            'episodes': anime.get('episodes', 0),
            'duration': anime.get('duration', '').replace(' per ep', '').replace(' min', '') or 0,
            'status': anime.get('status', ''),
            'source': anime.get('source', ''),
            'season': f"{anime.get('season', '')} {anime.get('year', '')}".strip(),
            'studios': ';'.join(studios),
            'producers': ';'.join(producers),
            'genres': ';'.join(genres),
            'rating': anime.get('rating', ''),
            'score': anime.get('score', 0),
            'scored_by': anime.get('scored_by', 0),
            'rank': anime.get('rank', 0),
            'popularity': anime.get('popularity', 0),
            
            # User interaction statistics from Jikan
            'members': stats_data['total'],
            'favorites': anime.get('favorites', 0),  # Available in basic data
            'watching': stats_data['watching'],
            'completed': stats_data['completed'],
            'on_hold': stats_data['on_hold'],
            'dropped': stats_data['dropped'],
            'plan_to_watch': stats_data['plan_to_watch'],
            
            'start_date': start_date,
            'end_date': end_date,
            'broadcast_day': anime.get('broadcast', {}).get('day', ''),
            'broadcast_time': anime.get('broadcast', {}).get('time', ''),
            'synopsis': (anime.get('synopsis', '') or '').replace('\n', ' ').replace('\r', ''),
            
            # Additional Jikan-specific fields
            'trailer_url': anime.get('trailer', {}).get('url', ''),
            'image_url': anime.get('images', {}).get('jpg', {}).get('large_image_url', ''),
            'approved': anime.get('approved', False),
            'explicit_genres': ';'.join([genre['name'] for genre in anime.get('explicit_genres', [])]),
            'themes': ';'.join([theme['name'] for theme in anime.get('themes', [])]),
            'demographics': ';'.join([demo['name'] for demo in anime.get('demographics', [])])
        }
        
        processed_data.append(anime_info)
    
    print(f"Made {individual_requests_made} individual statistics requests")
    return processed_data

def save_jikan_data(data, folder='data/raw'):
    """Save Jikan data to CSV."""
    if not data:
        print("No Jikan data to save")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Generate filename with UTC date
    current_date = datetime.utcnow().strftime('%Y%m%d')
    filename = f'{folder}/jikan_seasonal_{current_date}.csv'
    
    # Create folder if it doesn't exist
    os.makedirs(folder, exist_ok=True)
    
    try:
        df.to_csv(filename, index=False, encoding='utf-8')
        print(f"Jikan data saved to {filename}")
        
        # Verify file was created
        if os.path.exists(filename):
            file_size = os.path.getsize(filename)
            print(f"File created successfully. Size: {file_size} bytes, Entries: {len(df)}")
            return filename
        else:
            print("Warning: File was not created!")
            return None
            
    except Exception as e:
        print(f"Error saving Jikan data: {e}")
        raise

def main():
    start_time = time.time()
    print("Starting Jikan seasonal anime data collection...")
    
    # Get all seasons (you can adjust the start year)
    all_seasons = get_all_seasons(start_year=1970)  # Starting from 2020 to manage API limits
    all_anime_data = []
    unique_anime_ids = set()
    
    print(f"Will collect data for {len(all_seasons)} seasons...")
    
    for i, (year, season) in enumerate(all_seasons):
        print(f"\n[{i+1}/{len(all_seasons)}] Processing {season} {year}")
        
        seasonal_data = fetch_seasonal_anime_jikan(year, season)
        
        # Add only unique anime
        for anime in seasonal_data:
            anime_id = anime.get('mal_id')
            if anime_id and anime_id not in unique_anime_ids:
                all_anime_data.append(anime)
                unique_anime_ids.add(anime_id)
        
        # Rate limiting between seasons
        time.sleep(1)
        
    print(f"\nCollected {len(all_anime_data)} unique anime from Jikan")
    
    if all_anime_data:
        print("\nProcessing collected data...")
        # Enable individual statistics fetching for a sample
        processed_data = process_jikan_anime_data(
            all_anime_data, 
            fetch_individual_stats=True,
            max_individual_requests=200  # Limit individual requests
        )
        
        print("Saving data...")
        filename = save_jikan_data(processed_data)
        
        if filename:
            # Print summary statistics
            df = pd.DataFrame(processed_data)
            print(f"\n=== Jikan Collection Summary ===")
            print(f"Total unique anime collected: {len(df)}")
            print(f"Unique genres: {len(set(';'.join(df['genres'].dropna()).split(';')))}")
            print(f"Unique studios: {len(set(';'.join(df['studios'].dropna()).split(';')))}")
            print(f"Date range: {df['start_date'].min()} to {df['start_date'].max()}")
            print(f"Average score: {df[df['score'] > 0]['score'].mean():.2f}")
            
            # User interaction statistics
            print(f"\nUser Interaction Statistics (Jikan):")
            print(f"Anime with member data: {len(df[df['members'] > 0])}/{len(df)}")
            print(f"Total members across all anime: {df['members'].sum():,}")
            print(f"Total watching: {df['watching'].sum():,}")
            print(f"Total completed: {df['completed'].sum():,}")
            print(f"Total plan to watch: {df['plan_to_watch'].sum():,}")
            print(f"Average members per anime: {df[df['members'] > 0]['members'].mean():.0f}")
            
            print(f"\nData saved to: {filename}")
    
    else:
        print("No anime data collected from Jikan")
    end_time = time.time()
    print(f"Jikan data collection completed in {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    main()