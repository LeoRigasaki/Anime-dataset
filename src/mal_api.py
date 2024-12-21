import os
from dotenv import load_dotenv
import requests
import pandas as pd
from datetime import datetime

# Load environment variables
load_dotenv()

CLIENT_ID = os.getenv('MAL_CLIENT_ID')

def fetch_anime_rankings(limit=100):
    url = 'https://api.myanimelist.net/v2/anime/ranking'
    headers = {
        'X-MAL-CLIENT-ID': CLIENT_ID
    }
    
    params = {
        'ranking_type': 'all',
        'limit': limit,
        'fields': 'id,title,mean,rank,popularity,num_scoring_users,media_type,status,num_episodes,start_date,end_date'
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()['data']
    except Exception as e:
        print(f"Error fetching anime data: {e}")
        return None

def process_anime_data(raw_data):
    processed_data = []
    
    for item in raw_data:
        node = item['node']
        anime_info = {
            'anime_id': node['id'],
            'title': node['title'],
            'type': node['media_type'],
            'episodes': node['num_episodes'],
            'status': node['status'],
            'score': node['mean'],
            'scored_by': node['num_scoring_users'],
            'rank': node['rank'],
            'popularity': node['popularity'],
            'start_date': node.get('start_date', ''),
            'end_date': node.get('end_date', '')
        }
        processed_data.append(anime_info)
    
    return processed_data

def save_data(data):
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Generate filename with current date
    current_date = datetime.now().strftime('%Y%m%d')
    filename = f'data/raw/anime_ranking_{current_date}.csv'
    
    # Save to CSV
    df.to_csv(filename, index=False)
    print(f"Data saved to {filename}")
    return filename

def main():
    print("Fetching anime rankings...")
    raw_data = fetch_anime_rankings(limit=100)  # Fetch top 100 anime
    
    if raw_data:
        print("Processing data...")
        processed_data = process_anime_data(raw_data)
        
        print("Saving data...")
        filename = save_data(processed_data)
        print(f"Successfully collected data for {len(processed_data)} anime!")

if __name__ == "__main__":
    main()