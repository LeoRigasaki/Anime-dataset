import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const FALLBACK_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy',
  'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
]

const FEATURED_START_YEAR = 2026
const FEATURED_END_YEAR = 2029
const TABLE_CANDIDATES = ['animes_active', 'animes'] as const

type GenreRow = {
  genres: string[] | null
}

export async function GET() {
  try {
    for (const tableName of TABLE_CANDIDATES) {
      const result = await supabase
        .from(tableName)
        .select('genres')
        .gte('season_year', FEATURED_START_YEAR)
        .lte('season_year', FEATURED_END_YEAR)
        .limit(5000)

      if (result.error) {
        if (tableName === 'animes_active') {
          continue
        }
        return NextResponse.json({ genres: FALLBACK_GENRES })
      }

      const genres = Array.from(
        new Set(
          ((result.data || []) as GenreRow[])
            .flatMap((row) => row.genres || [])
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right))
        )
      )

      return NextResponse.json({
        genres: genres.length > 0 ? genres : FALLBACK_GENRES
      })
    }

    return NextResponse.json({ genres: FALLBACK_GENRES })
  } catch {
    return NextResponse.json({ genres: FALLBACK_GENRES })
  }
}
