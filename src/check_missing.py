import pandas as pd
from datetime import datetime
import glob
import os

def get_latest_anime_file(folder='data/raw'):
    """Get the most recent anime seasonal CSV file."""
    pattern = os.path.join(folder, 'anime_seasonal_*.csv')
    files = glob.glob(pattern)
    if not files:
        raise FileNotFoundError("No anime seasonal CSV files found")
    
    # Sort files by name (which includes date) and get the most recent
    latest_file = sorted(files)[-1]
    return latest_file

def main():
    try:
        # Find and read the latest CSV file
        latest_file = get_latest_anime_file()
        print(f"Reading anime data from {latest_file}...")
        df = pd.read_csv(latest_file)

        # Create a text file to write our findings
        with open('data/missing_data_report.txt', 'w', encoding='utf-8') as f:
            f.write("Anime Data Coverage Report\n")
            f.write("========================\n\n")
            
            # Write overall statistics
            f.write("Overall Statistics:\n")
            f.write(f"Total anime entries: {len(df)}\n")
            f.write(f"Date range: {df['start_date'].min()} to {df['start_date'].max()}\n\n")
            
            # Extract year from start_date using string manipulation
            df['year'] = df['start_date'].str[:4]  # Take first 4 characters (year)
            df['year'] = pd.to_numeric(df['year'], errors='coerce')  # Convert to number, invalid becomes NaN
            
            f.write("Anime Count by Year:\n")
            f.write("------------------\n")
            
            # Count anime per year
            yearly_counts = df['year'].value_counts().sort_index()
            
            for year, count in yearly_counts.items():
                if not pd.isna(year):  # Only print if year is valid
                    f.write(f"Year {int(year)}: {count} anime\n")
            
            # Find missing years
            all_years = range(1970, datetime.now().year + 1)
            existing_years = set(yearly_counts.index)
            
            f.write("\nMissing or Zero Count Years:\n")
            f.write("-------------------------\n")
            for year in all_years:
                if year not in existing_years:
                    f.write(f"Year {year}: No data found\n")
                elif yearly_counts[year] < 100:  # Assuming less than 100 anime per year is suspicious
                    f.write(f"Year {year}: Only {yearly_counts[year]} anime (possibly incomplete)\n")
                    
            # Add information about the current data file
            f.write("\nCurrent Data File:\n")
            f.write("----------------\n")
            f.write(f"Filename: {os.path.basename(latest_file)}\n")
            f.write(f"File date: {os.path.basename(latest_file).split('_')[2].split('.')[0]}\n")
            f.write(f"File size: {os.path.getsize(latest_file)} bytes\n")

        print("Report generated: data/missing_data_report.txt")
        
    except Exception as e:
        print(f"Error generating report: {e}")
        raise

if __name__ == "__main__":
    main()