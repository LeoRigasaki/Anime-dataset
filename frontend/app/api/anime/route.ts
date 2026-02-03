import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function getCurrentSeason(): string {
  const month = new Date().getMonth() + 1
  if (month <= 3) return 'WINTER'
  if (month <= 6) return 'SPRING'
  if (month <= 9) return 'SUMMER'
  return 'FALL'
}

function getCurrentYear(): number {
  return new Date().getFullYear()
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const season = searchParams.get('season') || getCurrentSeason()
  const year = parseInt(searchParams.get('year') || String(getCurrentYear()))
  const status = searchParams.get('status')
  const genres = searchParams.get('genres')
  const sort = searchParams.get('sort') || 'popularity'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 50)
  const offset = (page - 1) * limit

  let query = supabase
    .from('animes')
    .select(
      'anime_id, title, english_title, type, episodes, status, season, season_year, genres, score, popularity, cover_image_large, is_adult, next_airing_episode_at, next_episode_number, start_date, end_date',
      { count: 'exact' }
    )
    .eq('season_year', year)
    .eq('season', season)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (genres) {
    const genreArray = genres.split(',').map(g => g.trim())
    query = query.contains('genres', genreArray)
  }

  switch (sort) {
    case 'score':
      query = query.order('score', { ascending: false, nullsFirst: false })
      break
    case 'end_date':
      query = query.order('end_date', { ascending: true, nullsFirst: false })
      break
    default:
      query = query.order('popularity', { ascending: false, nullsFirst: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const anime = (data || []).map(row => ({
    anime_id: row.anime_id,
    title: row.english_title || row.title,
    romaji_title: row.title,
    status: row.status,
    episodes: row.episodes,
    type: row.type,
    cover_image: row.cover_image_large,
    score: row.score,
    genres: row.genres || [],
    is_adult: row.is_adult,
    predicted_completion: row.end_date,
    start_date: row.start_date,
    next_airing_episode_at: row.next_airing_episode_at,
    next_episode_number: row.next_episode_number,
  }))

  return NextResponse.json({
    season: `${season} ${year}`,
    anime,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
