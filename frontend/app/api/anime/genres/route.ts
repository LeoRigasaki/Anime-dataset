import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const FALLBACK_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy',
  'Horror', 'Mahou Shoujo', 'Mecha', 'Music', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
]

export async function GET() {
  try {
    const { data, error } = await supabase.rpc('get_distinct_genres')

    if (error) {
      return NextResponse.json({ genres: FALLBACK_GENRES })
    }

    const genres = (data || []).map((r: { genre: string }) => r.genre).filter(Boolean)
    return NextResponse.json({ genres: genres.length > 0 ? genres : FALLBACK_GENRES })
  } catch {
    return NextResponse.json({ genres: FALLBACK_GENRES })
  }
}
