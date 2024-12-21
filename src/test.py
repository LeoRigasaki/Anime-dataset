import pandas as pd
df = pd.read_csv('data/raw/anime_ranking_20241221.csv')
print(df.head(2).to_string())