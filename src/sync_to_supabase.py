"""
Sync anime data to Supabase from CSV files.
Designed for use in GitHub Actions and CLI.

Usage:
  # Sync from a CSV file (GitHub Actions / CLI)
  python src/sync_to_supabase.py --csv data/raw/anilist_seasonal_20250101.csv

  # Sync all matching CSVs from a directory
  python src/sync_to_supabase.py --csv-dir data/raw/ --pattern "anilist_seasonal_*.csv"

  # Dry run (validate without writing)
  python src/sync_to_supabase.py --csv data/raw/anilist_seasonal_20250101.csv --dry-run
"""

import os
import sys
import glob
import argparse
from typing import List, Dict, Any

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load_csv_as_dicts(csv_path: str) -> List[Dict[str, Any]]:
    """
    Read a CSV file and return list of dicts matching the format
    produced by process_anilist_seasonal_data().
    """
    df = pd.read_csv(csv_path)

    # Convert numeric fields from NaN/float to int
    int_fields = [
        'anime_id', 'mal_id', 'episodes', 'duration', 'season_year',
        'score', 'mean_score', 'scored_by', 'rank', 'popularity',
        'popularity_rank', 'members', 'favorites', 'watching',
        'completed', 'on_hold', 'dropped', 'plan_to_watch',
        'next_airing_episode_at', 'next_episode_number'
    ]
    for field in int_fields:
        if field in df.columns:
            df[field] = pd.to_numeric(df[field], errors='coerce').fillna(0).astype(int)

    # Convert boolean fields
    bool_fields = ['is_adult', 'is_licensed']
    for field in bool_fields:
        if field in df.columns:
            df[field] = df[field].map(
                lambda x: True if str(x).lower() in ('true', '1', 'yes') else False
            )

    # Replace NaN with empty string for string fields
    df = df.fillna('')

    return df.to_dict('records')


def sync_from_data(
    data: List[Dict[str, Any]],
    batch_size: int = 100,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Sync a list of anime dicts to Supabase.
    Returns a summary dict with counts and any errors.
    """
    from src.supabase_client import get_supabase_client

    result = {
        'total_records': len(data),
        'records_synced': 0,
        'errors': [],
        'dry_run': dry_run
    }

    if dry_run:
        print(f"[DRY RUN] Would sync {len(data)} records to Supabase")
        result['records_synced'] = len(data)
        return result

    try:
        client = get_supabase_client()

        if not client.health_check():
            result['errors'].append("Supabase health check failed")
            return result

        log_id = client.start_sync_log('github_actions_sync')

        try:
            synced = client.upsert_anime_batch(data, batch_size)
            result['records_synced'] = synced

            client.complete_sync_log(
                log_id,
                records_processed=len(data),
                records_inserted=synced,
                records_updated=0
            )
        except Exception as e:
            client.complete_sync_log(
                log_id,
                records_processed=len(data),
                records_inserted=result['records_synced'],
                records_updated=0,
                error_message=str(e)
            )
            result['errors'].append(str(e))

    except Exception as e:
        result['errors'].append(f"Failed to initialize Supabase: {e}")

    return result


def sync_from_csv(csv_path: str, batch_size: int = 100, dry_run: bool = False) -> Dict[str, Any]:
    """Load CSV and sync to Supabase."""
    if not os.path.exists(csv_path):
        return {'total_records': 0, 'records_synced': 0, 'errors': [f"File not found: {csv_path}"]}

    print(f"Loading data from {csv_path}...")
    data = load_csv_as_dicts(csv_path)
    print(f"Loaded {len(data)} records from CSV")

    return sync_from_data(data, batch_size, dry_run)


def main():
    parser = argparse.ArgumentParser(description='Sync anime data to Supabase from CSV')
    parser.add_argument('--csv', type=str, help='Path to CSV file to sync')
    parser.add_argument('--csv-dir', type=str, help='Directory containing CSV files')
    parser.add_argument('--pattern', type=str, default='anilist_seasonal_*.csv',
                        help='Glob pattern for CSV files (used with --csv-dir)')
    parser.add_argument('--batch-size', type=int, default=100)
    parser.add_argument('--dry-run', action='store_true', help='Validate without writing')

    args = parser.parse_args()

    if args.csv:
        result = sync_from_csv(args.csv, args.batch_size, args.dry_run)
        print(f"\nSync Summary:")
        print(f"  Total records: {result['total_records']}")
        print(f"  Records synced: {result['records_synced']}")
        if result['errors']:
            print(f"  Errors: {len(result['errors'])}")
            for err in result['errors']:
                print(f"    - {err}")
            sys.exit(1)

    elif args.csv_dir:
        pattern = os.path.join(args.csv_dir, args.pattern)
        files = sorted(glob.glob(pattern))
        if not files:
            print(f"No files matching {pattern}")
            sys.exit(1)

        total_synced = 0
        total_errors = []
        for csv_file in files:
            print(f"\n--- Syncing {os.path.basename(csv_file)} ---")
            result = sync_from_csv(csv_file, args.batch_size, args.dry_run)
            total_synced += result['records_synced']
            total_errors.extend(result['errors'])

        print(f"\nOverall: {total_synced} records synced, {len(total_errors)} errors")
        if total_errors:
            sys.exit(1)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
