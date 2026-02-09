"""
Migration script to load historical anime data into Supabase
Fetches data from AniList API for years 1970 to present
Only current year data will be updated on subsequent runs
"""

import os
import sys
import time
import argparse
from datetime import datetime
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.anilist_api import (
    fetch_seasonal_anime_anilist,
    process_anilist_seasonal_data,
    get_all_seasons
)
from src.supabase_client import get_supabase_client, SupabaseClient


def migrate_historical_data(
    start_year: int = 1970,
    end_year: int = None,
    batch_size: int = 100
):
    """
    Migrate historical anime data from AniList to Supabase.
    This is a one-time operation for historical data (pre-current year).

    Args:
        start_year: First year to fetch (default: 1970)
        end_year: Last year to fetch (default: current year - 1)
        batch_size: Number of records to upsert at once
    """
    current_year = datetime.now().year
    end_year = end_year or (current_year - 1)  # Don't include current year in historical

    print("=" * 60)
    print("HISTORICAL DATA MIGRATION TO SUPABASE")
    print("=" * 60)
    print(f"Date range: {start_year} to {end_year}")
    print(f"Current year ({current_year}) will be handled by sync_current_year()")
    print("=" * 60)

    # Initialize Supabase client
    try:
        client = get_supabase_client()
        if not client.health_check():
            print("ERROR: Cannot connect to Supabase. Check your credentials.")
            return
        print("Connected to Supabase successfully!")
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
        return

    # Start sync log
    log_id = client.start_sync_log('full_historical')

    total_processed = 0
    total_inserted = 0
    seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

    try:
        for year in range(start_year, end_year + 1):
            year_anime = []

            for season in seasons:
                print(f"\nFetching {season} {year}...")

                try:
                    raw_data = fetch_seasonal_anime_anilist(year, season)

                    if raw_data:
                        processed = process_anilist_seasonal_data(raw_data)
                        year_anime.extend(processed)
                        print(f"  Found {len(processed)} anime")
                    else:
                        print(f"  No data found")

                    # Rate limiting - AniList allows 90 requests per minute
                    time.sleep(1.5)

                except Exception as e:
                    print(f"  Error fetching {season} {year}: {e}")
                    continue

            # Upsert year's data to Supabase
            if year_anime:
                print(f"\nUpserting {len(year_anime)} anime from {year} to Supabase...")
                inserted = client.upsert_anime_batch(year_anime, batch_size)
                total_inserted += inserted
                total_processed += len(year_anime)
                print(f"Year {year} complete: {inserted} records upserted")

                # Archive completed seasons
                for season in seasons:
                    client.archive_season(year, season)

            # Progress update
            years_done = year - start_year + 1
            years_total = end_year - start_year + 1
            print(f"\nProgress: {years_done}/{years_total} years ({years_done/years_total*100:.1f}%)")

        # Complete sync log
        client.complete_sync_log(
            log_id,
            records_processed=total_processed,
            records_inserted=total_inserted,
            records_updated=0
        )

        print("\n" + "=" * 60)
        print("MIGRATION COMPLETE")
        print("=" * 60)
        print(f"Total anime processed: {total_processed}")
        print(f"Total records upserted: {total_inserted}")
        print(f"Years covered: {start_year} to {end_year}")
        print("=" * 60)

    except Exception as e:
        client.complete_sync_log(
            log_id,
            records_processed=total_processed,
            records_inserted=total_inserted,
            records_updated=0,
            error_message=str(e)
        )
        print(f"\nMIGRATION FAILED: {e}")
        raise


def sync_current_year(batch_size: int = 100):
    """
    Sync current year's anime data.
    This should be run daily/weekly to keep current year data fresh.

    - Fetches all 4 seasons of the current year
    - Updates existing records, inserts new ones
    - Does NOT touch historical data
    """
    current_year = datetime.now().year

    print("=" * 60)
    print(f"CURRENT YEAR SYNC: {current_year}")
    print("=" * 60)

    # Initialize Supabase client
    try:
        client = get_supabase_client()
        if not client.health_check():
            print("ERROR: Cannot connect to Supabase.")
            return
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
        return

    # Start sync log
    log_id = client.start_sync_log('current_year')

    total_processed = 0
    total_upserted = 0
    seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

    try:
        all_anime = []

        for season in seasons:
            print(f"\nFetching {season} {current_year}...")

            try:
                raw_data = fetch_seasonal_anime_anilist(current_year, season)

                if raw_data:
                    processed = process_anilist_seasonal_data(raw_data)
                    all_anime.extend(processed)
                    print(f"  Found {len(processed)} anime")

                time.sleep(1.5)  # Rate limiting

            except Exception as e:
                print(f"  Error fetching {season} {current_year}: {e}")
                continue

        # Upsert all current year data
        if all_anime:
            print(f"\nUpserting {len(all_anime)} anime to Supabase...")
            total_upserted = client.upsert_anime_batch(all_anime, batch_size)
            total_processed = len(all_anime)

        # Complete sync log
        client.complete_sync_log(
            log_id,
            records_processed=total_processed,
            records_inserted=0,
            records_updated=total_upserted
        )

        print("\n" + "=" * 60)
        print("CURRENT YEAR SYNC COMPLETE")
        print("=" * 60)
        print(f"Total anime processed: {total_processed}")
        print(f"Total records upserted: {total_upserted}")
        print("=" * 60)

    except Exception as e:
        client.complete_sync_log(
            log_id,
            records_processed=total_processed,
            records_inserted=0,
            records_updated=total_upserted,
            error_message=str(e)
        )
        print(f"\nSYNC FAILED: {e}")
        raise


def sync_single_year(year: int, batch_size: int = 100):
    """
    Sync a specific year's anime data.
    Useful for fixing data or backfilling specific years.
    """
    print("=" * 60)
    print(f"SINGLE YEAR SYNC: {year}")
    print("=" * 60)

    client = get_supabase_client()
    if not client.health_check():
        print("ERROR: Cannot connect to Supabase.")
        return

    log_id = client.start_sync_log(f'single_year_{year}')
    seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

    total_processed = 0
    total_upserted = 0

    try:
        all_anime = []

        for season in seasons:
            print(f"\nFetching {season} {year}...")

            raw_data = fetch_seasonal_anime_anilist(year, season)

            if raw_data:
                processed = process_anilist_seasonal_data(raw_data)
                all_anime.extend(processed)
                print(f"  Found {len(processed)} anime")

            time.sleep(1.5)

        if all_anime:
            print(f"\nUpserting {len(all_anime)} anime to Supabase...")
            total_upserted = client.upsert_anime_batch(all_anime, batch_size)
            total_processed = len(all_anime)

            # Archive seasons
            for season in seasons:
                client.archive_season(year, season)

        client.complete_sync_log(
            log_id,
            records_processed=total_processed,
            records_inserted=0,
            records_updated=total_upserted
        )

        print(f"\nYear {year} sync complete: {total_upserted} records")

    except Exception as e:
        client.complete_sync_log(log_id, total_processed, 0, total_upserted, str(e))
        raise


def print_stats():
    """Print current database statistics"""
    client = get_supabase_client()

    print("=" * 60)
    print("SUPABASE DATABASE STATISTICS")
    print("=" * 60)

    # Total anime count
    result = client.client.table('animes').select('*', count='exact').execute()
    total_count = result.count
    print(f"Total anime records: {total_count:,}")

    # Count by year (last 10 years)
    current_year = datetime.now().year
    print(f"\nAnime by year (last 10 years):")
    for year in range(current_year, current_year - 10, -1):
        count = client.get_anime_count_by_year(year)
        if count > 0:
            print(f"  {year}: {count:,} anime")

    # Count by status
    print(f"\nAnime by status:")
    for status in ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED']:
        result = client.client.table('animes').select('*', count='exact').eq('status', status).execute()
        print(f"  {status}: {result.count:,}")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='Migrate anime data to Supabase',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full historical migration (1970 to last year)
  python supabase_migrate.py --full --start-year 1970

  # Sync only current year (run daily/weekly)
  python supabase_migrate.py --current-year

  # Sync a specific year
  python supabase_migrate.py --year 2023

  # Sync from a CSV file (no API calls)
  python supabase_migrate.py --from-csv data/raw/anilist_seasonal_20251228.csv

  # Sync all CSVs from a directory
  python supabase_migrate.py --from-csv-dir data/raw/

  # Print database statistics
  python supabase_migrate.py --stats
        """
    )

    parser.add_argument(
        '--full',
        action='store_true',
        help='Run full historical migration (1970 to last year)'
    )
    parser.add_argument(
        '--current-year',
        action='store_true',
        help='Sync only current year data'
    )
    parser.add_argument(
        '--year',
        type=int,
        help='Sync a specific year'
    )
    parser.add_argument(
        '--start-year',
        type=int,
        default=1970,
        help='Start year for full migration (default: 1970)'
    )
    parser.add_argument(
        '--end-year',
        type=int,
        help='End year for full migration (default: current year - 1)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=100,
        help='Batch size for upserts (default: 100)'
    )
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Print database statistics'
    )
    parser.add_argument(
        '--from-csv',
        type=str,
        help='Sync from a CSV file instead of fetching from API'
    )
    parser.add_argument(
        '--from-csv-dir',
        type=str,
        help='Sync all matching CSVs from a directory'
    )

    args = parser.parse_args()

    if args.stats:
        print_stats()
    elif args.from_csv:
        from src.sync_to_supabase import sync_from_csv
        result = sync_from_csv(args.from_csv, args.batch_size)
        print(f"\nSync complete: {result['records_synced']}/{result['total_records']} records")
        if result['errors']:
            print(f"Errors: {result['errors']}")
            sys.exit(1)
    elif args.from_csv_dir:
        from src.sync_to_supabase import sync_from_csv
        import glob as g
        pattern = os.path.join(args.from_csv_dir, 'anilist_seasonal_*.csv')
        files = sorted(g.glob(pattern))
        if not files:
            print(f"No files matching {pattern}")
            sys.exit(1)
        for f in files:
            print(f"\n--- {os.path.basename(f)} ---")
            sync_from_csv(f, args.batch_size)
    elif args.full:
        migrate_historical_data(
            start_year=args.start_year,
            end_year=args.end_year,
            batch_size=args.batch_size
        )
    elif args.current_year:
        sync_current_year(batch_size=args.batch_size)
    elif args.year:
        sync_single_year(args.year, batch_size=args.batch_size)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
