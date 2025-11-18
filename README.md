# Anime Dataset & Recommendation Tool

A collection of anime data from MyAnimeList and AniList, updated daily. This project also includes a script to recommend anime based on shared genres and tags.

## Features

- **Daily Updates**: Runs automatically every day at midnight UTC.
- **Data Sources**: Collects data from AniList and MyAnimeList.
- **Recommendation Tool**: A terminal script that finds similar anime by comparing genres and tags.
- **Data Validation**: A script to check for missing data or gaps in the dataset.

## Project Structure

```
├── data/
│   └── raw/               # CSV files containing the anime data
├── docs/                  # Documentation
├── src/
│   ├── anilist_api.py     # Script to get data from AniList
│   ├── jikan_api.py       # Script to get data from Jikan (MyAnimeList)
│   ├── mal_api.py         # Script to get data from official MyAnimeList API
│   ├── recommend_anime.py # Script to recommend anime
│   └── check_missing.py   # Script to check data coverage
└── requirements.txt       # List of Python dependencies
```

## Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/LeoRigasaki/Anime-dataset.git
    cd Anime-dataset
    ```

2.  **Install dependencies**
    ```bash
    pip install -r requirements.txt
    ```

    *Requires Python 3.11 or higher.*

## Usage

### Recommendation Tool
To find similar anime:

```bash
python src/recommend_anime.py
```

Follow the prompts to search for an anime and see a list of similar titles.

### Data Collection
To run the data collection scripts manually:

**From AniList:**
```bash
python src/anilist_api.py
```

**From Jikan (MyAnimeList):**
```bash
python src/jikan_api.py
```

### Check Data
To generate a report on the dataset:
```bash
python src/check_missing.py
```
This creates a report at `data/missing_data_report.txt`.

## Data Format
The data is saved as CSV files in the `data/raw/` directory. Main columns include:
- `anime_id`: Unique ID
- `title`: Title of the anime
- `score`: Average score
- `genres`: List of genres
- `tags`: List of tags (from AniList)
- `members`: Number of users tracking the anime
- `synopsis`: Description

## Automation
The scripts are set to run automatically using GitHub Actions. You can check the [Actions tab](https://github.com/LeoRigasaki/Anime-dataset/actions) for the status of the daily updates.