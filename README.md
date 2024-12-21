# Anime Dataset

A daily-updated collection of anime data from MyAnimeList.

## Structure
- `data/`: Contains the anime datasets
  - `raw/`: Raw data collected from MyAnimeList API
- `docs/`: Documentation and data dictionary
- `src/`: Source code
  - `mal_api.py`: MyAnimeList API interaction
  - `check_missing.py`: Data validation script
  - `test.py`: Testing utilities

## Updates
The dataset updates automatically every day at midnight UTC using GitHub Actions.

## Requirements
- Python 3.11
- Required packages:
  - requests==2.31.0
  - python-dotenv==1.0.0
  - pandas==2.2.0

## Data Files
- `data/raw/anime_seasonal_[DATE].csv`: Daily snapshot of anime data
- `data/missing_data_report.txt`: Report of any missing or incomplete data

## Status
Check the Actions tab for daily update status and reports.