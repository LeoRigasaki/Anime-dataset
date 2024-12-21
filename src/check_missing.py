import pandas as pd
from datetime import datetime

# Read the CSV file
print("Reading anime data...")
df = pd.read_csv('data/raw/anime_seasonal_20241221.csv')

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

print("Report generated: data/missing_data_report.txt")