import os
from dotenv import load_dotenv
import requests
import pandas as pd
from datetime import datetime
import time
import glob

# Load environment variables
load_dotenv()

CLIENT_ID = os.getenv('MAL_CLIENT_ID')

def get_all_seasons(start_year=1970):
    current_year = datetime.now().year
    seasons = ['winter', 'spring', 'summer', 'fall']
    all_seasons = []
    
    for year in range(start_year, current_year + 1):
        for season in seasons:
            all_seasons.append((year, season))
    
    return all_seasons

def fetch_seasonal_anime(year, season, limit_per_page=500):
    url = f'https://api.myanimelist.net/v2/anime/season/{year}/{season}'
    headers = {
        'X-MAL-CLIENT-ID': CLIENT_ID
    }
    
    params = {
        'limit': limit_per_page,
        'fields': ('id,title,mean,rank,popularity,num_scoring_users,'
                  'media_type,status,num_episodes,start_date,end_date,'
                  'genres,studios,source,synopsis,rating,alternative_titles,'
                  'start_season,broadcast,average_episode_duration,statistics')
    }
    
    try:
        print(f"Fetching {season} {year} anime...")
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        print(f"Retrieved {len(data.get('data', []))} anime for {season} {year}")
        return data.get('data', [])
    except Exception as e:
        print(f"Error fetching {season} {year}: {e}")
        return []

def process_anime_data(raw_data):
    processed_data = []
    
    for item in raw_data:
        node = item['node']
        
        # Get genres list
        genres = [genre['name'] for genre in node.get('genres', [])]
        
        # Get studios list
        studios = [studio['name'] for studio in node.get('studios', [])]
        
        # Get alternative titles
        alt_titles = node.get('alternative_titles', {})
        
        # Process statistics
        stats = node.get('statistics', {})
        
        anime_info = {
            'anime_id': node['id'],
            'title': node['title'],
            'english_title': alt_titles.get('en', ''),
            'japanese_title': alt_titles.get('ja', ''),
            'type': node['media_type'],
            'episodes': node['num_episodes'],
            'duration': node.get('average_episode_duration', 0),
            'status': node['status'],
            'source': node.get('source', ''),
            'season': f"{node.get('start_season', {}).get('season', '')} {node.get('start_season', {}).get('year', '')}",
            'studios': ';'.join(studios),
            'genres': ';'.join(genres),
            'rating': node.get('rating', ''),
            'score': node.get('mean', 0),
            'scored_by': node.get('num_scoring_users', 0),
            'rank': node.get('rank', 0),
            'popularity': node.get('popularity', 0),
            'members': stats.get('num_list_users', 0),
            'favorites': stats.get('num_favorites', 0),
            'watching': stats.get('status', {}).get('watching', 0),
            'completed': stats.get('status', {}).get('completed', 0),
            'on_hold': stats.get('status', {}).get('on_hold', 0),
            'dropped': stats.get('status', {}).get('dropped', 0),
            'plan_to_watch': stats.get('status', {}).get('plan_to_watch', 0),
            'start_date': node.get('start_date', ''),
            'end_date': node.get('end_date', ''),
            'broadcast_day': node.get('broadcast', {}).get('day_of_the_week', ''),
            'broadcast_time': node.get('broadcast', {}).get('start_time', ''),
            'synopsis': node.get('synopsis', '').replace('\n', ' ').replace('\r', '')
        }
        processed_data.append(anime_info)
    
    return processed_data

def clean_old_files(keep_file_path, folder='data/raw'):
    """Remove all anime seasonal CSV files except the one we just created"""
    print(f"Cleaning old files in {folder}, keeping {os.path.basename(keep_file_path)}")
    if os.path.exists(folder):
        files = glob.glob(os.path.join(folder, 'anime_seasonal_*.csv'))
        print(f"Found {len(files)} seasonal anime files in directory")
        for file_path in files:
            if file_path != keep_file_path:  # Keep the newly created file
                try:
                    print(f"Removing old file: {os.path.basename(file_path)}")
                    os.remove(file_path)
                    print(f"Successfully removed: {os.path.basename(file_path)}")
                except Exception as e:
                    print(f"Error removing {file_path}: {e}")
    else:
        print(f"Directory {folder} does not exist")

def save_data(data, folder='data/raw'):
    """Save data to CSV and ensure the file exists."""
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Generate filename with UTC date to match GitHub Actions
    current_date = datetime.utcnow().strftime('%Y%m%d')
    print(f"Using UTC date for filename: {current_date}")
    filename = f'{folder}/anime_seasonal_{current_date}.csv'
    
    # Create folder if it doesn't exist
    os.makedirs(folder, exist_ok=True)
    
    # Save to CSV with UTF-8 encoding
    try:
        df.to_csv(filename, index=False, encoding='utf-8')
        print(f"Data saved to {filename}")
        
        # Verify file was created
        if os.path.exists(filename):
            file_size = os.path.getsize(filename)
            print(f"File created successfully. Size: {file_size} bytes")
            if file_size == 0:
                print("Warning: File is empty!")
                return None
            
            # Only clean old files if the new file was successfully created
            clean_old_files(filename, folder)
            
            return filename
        else:
            print("Warning: File was not created!")
            return None
    except Exception as e:
        print(f"Error saving data: {e}")
        raise

def main():
    print("Starting anime data collection...")
    print(f"Using Client ID: {CLIENT_ID[:5]}..." if CLIENT_ID else "No Client ID found!")
    
    all_seasons = get_all_seasons()
    all_anime_data = []
    unique_anime_ids = set()  # To avoid duplicates
    
    for year, season in all_seasons:
        seasonal_data = fetch_seasonal_anime(year, season)
        
        # Add only unique anime
        for anime in seasonal_data:
            if anime['node']['id'] not in unique_anime_ids:
                all_anime_data.append(anime)
                unique_anime_ids.add(anime['node']['id'])
        
        # Add delay to avoid rate limiting
        time.sleep(1)
    
    if all_anime_data:
        print("\nProcessing all collected data...")
        processed_data = process_anime_data(all_anime_data)
        
        print("Saving data...")
        filename = save_data(processed_data)
        
        if filename:
            # Print summary statistics
            df = pd.read_csv(filename)
            print("\nCollection Summary:")
            print(f"Total unique anime collected: {len(df)}")
            print(f"Unique genres: {len(set(';'.join(df['genres'].dropna()).split(';')))}")
            print(f"Unique studios: {len(set(';'.join(df['studios'].dropna()).split(';')))}")
            print(f"Date range: {df['start_date'].min()} to {df['start_date'].max()}")
            print(f"Average score: {df['score'].mean():.2f}")
            print(f"Data saved to: {filename}")

if __name__ == "__main__":
    main()