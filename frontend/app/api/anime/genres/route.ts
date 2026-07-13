import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { FEATURED_END_YEAR, FEATURED_START_YEAR } from '@/lib/dataset-window'

const FALLBACK_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy',
  'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
]

const TABLE_CANDIDATES = ['animes_active', 'animes'] as const

type GenreRow = {
  genres: string[] | null
}

export async function GET(request: NextRequest) {
  const includeAdult = request.nextUrl.searchParams.get('adult') === 'true'
  try {
    for (const tableName of TABLE_CANDIDATES) {
      let query = supabase
        .from(tableName)
        .select('genres')
        .gte('season_year', FEATURED_START_YEAR)
        .lte('season_year', FEATURED_END_YEAR)
        .limit(5000)

      if (!includeAdult) {
        query = query.not('is_adult', 'is', true)
      }

      const result = await query

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
