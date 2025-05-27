import requests
import pandas as pd
from datetime import datetime, timezone
import time
import os
import json

# API endpoints
ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co'

def make_graphql_request(query, variables=None):
    """Make a GraphQL request to AniList API."""
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    
    payload = {
        'query': query,
        'variables': variables or {}
    }
    
    try:
        response = requests.post(ANILIST_GRAPHQL_URL, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            if 'errors' in result:
                print(f"GraphQL errors: {result['errors']}")
                return None
            return result
        else:
            print(f"HTTP request failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Error making GraphQL request: {e}")
        return None

def get_all_seasons(start_year=1970):
    """Generate all seasons to fetch."""
    current_year = datetime.now().year
    seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
    all_seasons = []
    
    for year in range(start_year, current_year + 1):
        for season in seasons:
            all_seasons.append((year, season))
    
    return all_seasons

def fetch_seasonal_anime_anilist(year, season):
    """Fetch seasonal anime from AniList with comprehensive data."""
    query = '''
    query ($page: Int, $year: Int, $season: MediaSeason) {
        Page(page: $page, perPage: 500) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
                perPage
            }
            media(seasonYear: $year, season: $season, type: ANIME, sort: POPULARITY_DESC) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                    userPreferred
                }
                type
                format
                status
                description
                startDate {
                    year
                    month
                    day
                }
                endDate {
                    year
                    month
                    day
                }
                season
                seasonYear
                episodes
                duration
                chapters
                volumes
                countryOfOrigin
                isLicensed
                source
                hashtag
                trailer {
                    id
                    site
                    thumbnail
                }
                updatedAt
                coverImage {
                    extraLarge
                    large
                    medium
                    color
                }
                bannerImage
                genres
                synonyms
                averageScore
                meanScore
                popularity
                favourites
                tags {
                    id
                    name
                    description
                    category
                    rank
                    isGeneralSpoiler
                    isMediaSpoiler
                    isAdult
                }
                relations {
                    edges {
                        id
                        relationType
                        node {
                            id
                            title {
                                userPreferred
                            }
                            format
                            type
                            status
                        }
                    }
                }
                characters(sort: [ROLE, RELEVANCE, ID]) {
                    edges {
                        id
                        role
                        name
                        voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
                            id
                            name {
                                first
                                middle
                                last
                                full
                                native
                            }
                            language
                            image {
                                large
                                medium
                            }
                        }
                        node {
                            id
                            name {
                                first
                                middle
                                last
                                full
                                native
                            }
                            image {
                                large
                                medium
                            }
                        }
                    }
                }
                staff(sort: [RELEVANCE, ID]) {
                    edges {
                        id
                        role
                        node {
                            id
                            name {
                                first
                                middle
                                last
                                full
                                native
                            }
                            language
                            image {
                                large
                                medium
                            }
                        }
                    }
                }
                studios {
                    edges {
                        id
                        isMain
                        node {
                            id
                            name
                            isAnimationStudio
                            siteUrl
                        }
                    }
                }
                isAdult
                nextAiringEpisode {
                    id
                    airingAt
                    timeUntilAiring
                    episode
                }
                airingSchedule {
                    edges {
                        node {
                            id
                            airingAt
                            timeUntilAiring
                            episode
                        }
                    }
                }
                trends {
                    edges {
                        node {
                            averageScore
                            popularity
                            inProgress
                            releasing
                            episode
                            date
                        }
                    }
                }
                externalLinks {
                    id
                    url
                    site
                    siteId
                }
                streamingEpisodes {
                    title
                    thumbnail
                    url
                    site
                }
                rankings {
                    id
                    rank
                    type
                    format
                    year
                    season
                    allTime
                    context
                }
                stats {
                    scoreDistribution {
                        score
                        amount
                    }
                    statusDistribution {
                        status
                        amount
                    }
                }
                siteUrl
                autoCreateForumThread
                isRecommendationBlocked
                modNotes
            }
        }
    }
    '''
    
    all_anime = []
    page = 1
    
    while True:
        variables = {
            'page': page,
            'year': year,
            'season': season
        }
        
        print(f"Fetching {season} {year} anime (page {page})...")
        result = make_graphql_request(query, variables)
        
        if not result or 'data' not in result:
            break
        
        page_data = result['data']['Page']
        media_list = page_data.get('media', [])
        
        if not media_list:
            break
        
        all_anime.extend(media_list)
        print(f"  Retrieved {len(media_list)} anime (total: {len(all_anime)})")
        
        # Check if there's a next page
        page_info = page_data.get('pageInfo', {})
        if not page_info.get('hasNextPage', False):
            break
        
        page += 1
        time.sleep(1)  # Rate limiting
    
    print(f"Total anime collected for {season} {year}: {len(all_anime)}")
    return all_anime

def format_date(date_obj):
    """Format AniList date object to YYYY-MM-DD string."""
    if not date_obj or not isinstance(date_obj, dict):
        return ''
    
    year = date_obj.get('year')
    month = date_obj.get('month')
    day = date_obj.get('day')
    
    if not year:
        return ''
    
    month = month or 1
    day = day or 1
    
    try:
        return f"{year:04d}-{month:02d}-{day:02d}"
    except:
        return ''

def process_anilist_seasonal_data(raw_data):
    """Process raw AniList seasonal data into standardized format."""
    processed_data = []
    
    for anime in raw_data:
        if not anime:
            continue
        
        # Get basic info
        title_obj = anime.get('title', {})
        
        # Get genres, tags, studios
        genres = anime.get('genres', [])
        tags = anime.get('tags', [])
        tag_names = [tag['name'] for tag in tags if not tag.get('isGeneralSpoiler', False)]
        
        studio_edges = anime.get('studios', {}).get('edges', [])
        studios = [edge['node']['name'] for edge in studio_edges if edge.get('node')]
        main_studios = [edge['node']['name'] for edge in studio_edges 
                       if edge.get('node') and edge.get('isMain', False)]
        
        # Get characters (limit to avoid huge data)
        character_edges = anime.get('characters', {}).get('edges', [])[:10]
        main_characters = [edge['node']['name']['full'] for edge in character_edges 
                         if edge.get('node', {}).get('name', {}).get('full')]
        
        # Get staff (limit to avoid huge data)
        staff_edges = anime.get('staff', {}).get('edges', [])[:10]
        staff_names = [f"{edge['node']['name']['full']} ({edge.get('role', 'Unknown')})" 
                      for edge in staff_edges 
                      if edge.get('node', {}).get('name', {}).get('full')]
        
        # Get external links
        external_links = anime.get('externalLinks', [])
        streaming_sites = [link['site'] for link in external_links if link.get('site')]
        
        # Get status distribution (user engagement stats)
        stats = anime.get('stats', {})
        status_distribution = stats.get('statusDistribution', [])
        
        # Convert status distribution to dictionary
        status_stats = {}
        for status_item in status_distribution:
            status = status_item.get('status', '').lower()
            amount = status_item.get('amount', 0)
            
            if status == 'current':
                status_stats['watching'] = amount
            elif status == 'completed':
                status_stats['completed'] = amount
            elif status == 'paused':
                status_stats['on_hold'] = amount
            elif status == 'dropped':
                status_stats['dropped'] = amount
            elif status == 'planning':
                status_stats['plan_to_watch'] = amount
        
        # Calculate total members
        total_members = sum(status_stats.values())
        
        # Get score distribution
        score_distribution = stats.get('scoreDistribution', [])
        
        # Get rankings
        rankings = anime.get('rankings', [])
        overall_rank = 0
        popularity_rank = 0
        
        for ranking in rankings:
            if ranking.get('type') == 'RATED' and ranking.get('allTime', False):
                overall_rank = ranking.get('rank', 0)
            elif ranking.get('type') == 'POPULAR' and ranking.get('allTime', False):
                popularity_rank = ranking.get('rank', 0)
        
        processed_anime = {
            'anime_id': anime.get('id'),
            'mal_id': anime.get('idMal'),
            'title': title_obj.get('romaji', ''),
            'english_title': title_obj.get('english', ''),
            'japanese_title': title_obj.get('native', ''),
            'user_preferred_title': title_obj.get('userPreferred', ''),
            'type': anime.get('format', ''),
            'episodes': anime.get('episodes', 0),
            'duration': anime.get('duration', 0),
            'status': anime.get('status', ''),
            'source': anime.get('source', ''),
            'season': f"{anime.get('season', '')} {anime.get('seasonYear', '')}".strip(),
            'season_year': anime.get('seasonYear', 0),
            'studios': ';'.join(studios),
            'main_studios': ';'.join(main_studios),
            'genres': ';'.join(genres),
            'tags': ';'.join(tag_names[:10]),  # Limit tags
            'rating': '',  # AniList doesn't have traditional ratings like MAL
            'score': anime.get('averageScore', 0),
            'mean_score': anime.get('meanScore', 0),
            'scored_by': 0,  # Not directly available in AniList
            'rank': overall_rank,
            'popularity': anime.get('popularity', 0),
            'popularity_rank': popularity_rank,
            
            # User interaction statistics (from AniList stats)
            'members': total_members,
            'favorites': anime.get('favourites', 0),
            'watching': status_stats.get('watching', 0),
            'completed': status_stats.get('completed', 0),
            'on_hold': status_stats.get('on_hold', 0),
            'dropped': status_stats.get('dropped', 0),
            'plan_to_watch': status_stats.get('plan_to_watch', 0),
            
            'start_date': format_date(anime.get('startDate')),
            'end_date': format_date(anime.get('endDate')),
            'broadcast_day': '',  # Not available in this query
            'broadcast_time': '',  # Not available in this query
            'synopsis': (anime.get('description', '') or '').replace('\n', ' ').replace('\r', '')[:1000],
            
            # AniList-specific additional fields
            'country_of_origin': anime.get('countryOfOrigin', ''),
            'is_licensed': anime.get('isLicensed', False),
            'hashtag': anime.get('hashtag', ''),
            'cover_image_large': anime.get('coverImage', {}).get('large', ''),
            'cover_image_color': anime.get('coverImage', {}).get('color', ''),
            'banner_image': anime.get('bannerImage', ''),
            'trailer_site': anime.get('trailer', {}).get('site', '') if anime.get('trailer') else '',
            'trailer_id': anime.get('trailer', {}).get('id', '') if anime.get('trailer') else '',
            'main_characters': ';'.join(main_characters[:5]),
            'main_staff': ';'.join(staff_names[:5]),
            'streaming_sites': ';'.join(streaming_sites),
            'is_adult': anime.get('isAdult', False),
            'synonyms': ';'.join(anime.get('synonyms', [])[:5]),
            'site_url': anime.get('siteUrl', ''),
            'updated_at': anime.get('updatedAt', 0),
            
            # Collection metadata
            'collected_at': datetime.now(timezone.utc).isoformat(),
            'data_source': 'anilist'
        }
        
        processed_data.append(processed_anime)
    
    return processed_data

def save_combined_data(data, folder='data/raw'):
    """Save combined seasonal AniList data to CSV."""
    if not data:
        print("No combined data to save")
        return None
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Generate filename with UTC date
    current_date = datetime.now(timezone.utc).strftime('%Y%m%d')
    filename = f'{folder}/anilist_seasonal_{current_date}.csv'
    
    # Create folder if it doesn't exist
    os.makedirs(folder, exist_ok=True)
    
    try:
        df.to_csv(filename, index=False, encoding='utf-8')
        print(f"Combined AniList data saved to {filename}")
        
        # Verify file was created
        if os.path.exists(filename):
            file_size = os.path.getsize(filename)
            print(f"File created successfully. Size: {file_size} bytes, Entries: {len(df)}")
            return filename
        else:
            print("Warning: File was not created!")
            return None
            
    except Exception as e:
        print(f"Error saving combined data: {e}")
        raise

def main():
    start_time = time.time()
    print("Starting combined seasonal anime + AniList data collection...")
    
    # Get seasons to fetch (adjust range as needed)
    all_seasons = get_all_seasons(start_year=1970)  # Start from 2010 for better data quality
    all_anime_data = []
    unique_anime_ids = set()
    
    print(f"Will collect data for {len(all_seasons)} seasons from AniList...")
    
    for i, (year, season) in enumerate(all_seasons):
        print(f"\n[{i+1}/{len(all_seasons)}] Processing {season} {year}")
        
        seasonal_data = fetch_seasonal_anime_anilist(year, season)
        
        # Add only unique anime
        for anime in seasonal_data:
            anime_id = anime.get('id')
            if anime_id and anime_id not in unique_anime_ids:
                all_anime_data.append(anime)
                unique_anime_ids.add(anime_id)
        
        # Rate limiting between seasons
        time.sleep(2)
        
    print(f"\nCollected {len(all_anime_data)} unique anime from AniList")
    
    if all_anime_data:
        print("\nProcessing collected AniList data...")
        processed_data = process_anilist_seasonal_data(all_anime_data)
        
        print("Saving combined data...")
        filename = save_combined_data(processed_data)
        
        if filename:
            # Print comprehensive summary statistics
            df = pd.DataFrame(processed_data)
            print(f"\n=== AniList Seasonal Collection Summary ===")
            print(f"Total unique anime collected: {len(df)}")
            print(f"Unique genres: {len(set(';'.join(df['genres'].dropna()).split(';')))}")
            print(f"Unique studios: {len(set(';'.join(df['studios'].dropna()).split(';')))}")
            print(f"Date range: {df['start_date'].min()} to {df['start_date'].max()}")
            print(f"Average score: {df[df['score'] > 0]['score'].mean():.2f}")
            print(f"Score range: {df[df['score'] > 0]['score'].min():.1f} - {df[df['score'] > 0]['score'].max():.1f}")
            
            # User interaction statistics
            print(f"\n=== User Interaction Statistics (AniList) ===")
            print(f"Anime with member data: {len(df[df['members'] > 0])}/{len(df)} ({len(df[df['members'] > 0])/len(df)*100:.1f}%)")
            print(f"Total members across all anime: {df['members'].sum():,}")
            print(f"Total watching: {df['watching'].sum():,}")
            print(f"Total completed: {df['completed'].sum():,}")
            print(f"Total on hold: {df['on_hold'].sum():,}")
            print(f"Total dropped: {df['dropped'].sum():,}")
            print(f"Total plan to watch: {df['plan_to_watch'].sum():,}")
            print(f"Total favorites: {df['favorites'].sum():,}")
            
            # Engagement analysis
            print(f"\n=== Engagement Analysis ===")
            engaged_anime = df[df['members'] > 0]
            if len(engaged_anime) > 0:
                print(f"Average members per anime: {engaged_anime['members'].mean():.0f}")
                print(f"Median members per anime: {engaged_anime['members'].median():.0f}")
                print(f"Most popular anime: {df.loc[df['members'].idxmax(), 'title']} ({df['members'].max():,} members)")
                print(f"Highest rated anime: {df.loc[df['score'].idxmax(), 'title']} (Score: {df['score'].max():.1f})")
            
            # Format distribution
            print(f"\n=== Format Distribution ===")
            format_counts = df['type'].value_counts()
            for format_type, count in format_counts.head(10).items():
                print(f"{format_type}: {count} ({count/len(df)*100:.1f}%)")
            
            # Season distribution
            print(f"\n=== Season Distribution ===")
            season_counts = df['season_year'].value_counts().sort_index()
            for year, count in season_counts.tail(10).items():
                if year > 0:  # Only show valid years
                    print(f"{int(year)}: {count} anime")
            
            # Source material distribution
            print(f"\n=== Source Material Distribution ===")
            source_counts = df['source'].value_counts()
            for source, count in source_counts.head(8).items():
                if source:  # Only show non-empty sources
                    print(f"{source}: {count} ({count/len(df)*100:.1f}%)")
            
            print(f"\nData saved to: {filename}")
            
            # Additional analysis for recommendation systems
            print(f"\n=== Recommendation System Readiness ===")
            print(f"Content-based features available:")
            print(f"  - Genres: ✓ ({len(set(';'.join(df['genres'].dropna()).split(';')))} unique)")
            print(f"  - Studios: ✓ ({len(set(';'.join(df['studios'].dropna()).split(';')))} unique)")
            print(f"  - Tags: ✓ ({len(set(';'.join(df['tags'].dropna()).split(';')))} unique)")
            print(f"  - Source material: ✓")
            print(f"  - Scores: ✓ ({len(df[df['score'] > 0])}/{len(df)} anime)")
            print(f"  - Synopsis: ✓ ({len(df[df['synopsis'].str.len() > 10])}/{len(df)} anime)")
            
            print(f"Collaborative filtering features available:")
            print(f"  - User engagement data: ✓ ({len(df[df['members'] > 0])}/{len(df)} anime)")
            print(f"  - Status breakdowns: ✓ (watching, completed, dropped, etc.)")
            print(f"  - Popularity metrics: ✓")
            print(f"  - Favorites data: ✓")
            
            # Data quality assessment
            missing_critical_data = len(df[(df['score'] == 0) & (df['members'] == 0)])
            print(f"\nData quality: {len(df) - missing_critical_data}/{len(df)} anime have either score or engagement data")
            
    else:
        print("No anime data collected from AniList")
        print("This might be due to:")
        print("1. API rate limiting")
        print("2. Network connectivity issues")
        print("3. Changes in AniList API structure")
        print("4. Invalid season/year combinations")
        
    end_time = time.time()
    print(f"Data collection completed in {end_time - start_time:.2f} seconds")
if __name__ == "__main__":
    main()