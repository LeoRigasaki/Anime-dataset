import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const FEATURED_START_YEAR = 2026
const FEATURED_END_YEAR = 2029
const TABLE_CANDIDATES = ['animes_active', 'animes'] as const

type AnimeRow = {
  anime_id: number
  title: string
  english_title: string | null
  type: string | null
  episodes: number | null
  status: string | null
  season: string | null
  season_year: number | null
  genres: string[] | null
  score: number | null
  popularity: number | null
  cover_image_large: string | null
  is_adult: boolean | null
  next_airing_episode_at: number | null
  next_episode_number: number | null
  start_date: string | null
  end_date: string | null
  synopsis: string | null
  main_studios: string[] | null
  site_url: string | null
}

function parseOptionalInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function buildWindowLabel(year: number | null, season: string | null): string {
  if (year !== null && season) return `${season} ${year}`
  if (year !== null) {
    const archiveLabel =
      year < FEATURED_START_YEAR || year > FEATURED_END_YEAR ? 'Archive' : 'Year'
    return `${archiveLabel} ${year}`
  }
  return `Updated Anime ${FEATURED_START_YEAR}-${FEATURED_END_YEAR}`
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const season = searchParams.get('season')
  const year = parseOptionalInt(searchParams.get('year'))
  const status = searchParams.get('status')
  const genres = searchParams.get('genres')
  // Strip characters that would break PostgREST or() filter syntax
  const search = (searchParams.get('search') || '').replace(/[,%()]/g, ' ').trim()
  const includeAdult = searchParams.get('adult') === 'true'
  const sort = searchParams.get('sort') || 'popularity'
  const page = Math.max(parseOptionalInt(searchParams.get('page')) || 1, 1)
  const limit = Math.min(parseOptionalInt(searchParams.get('limit')) || 30, 50)
  const offset = (page - 1) * limit

  let data: AnimeRow[] | null = null
  let count = 0
  let lastError: { message: string } | null = null

  for (const tableName of TABLE_CANDIDATES) {
    let query = supabase
      .from(tableName)
      .select(
        'anime_id, title, english_title, type, episodes, status, season, season_year, genres, score, popularity, cover_image_large, is_adult, next_airing_episode_at, next_episode_number, start_date, end_date, synopsis, main_studios, site_url',
        { count: 'exact' }
      )

    if (!includeAdult) {
      query = query.not('is_adult', 'is', true)
    }

    if (year !== null) {
      query = query.eq('season_year', year)
    } else {
      query = query
        .gte('season_year', FEATURED_START_YEAR)
        .lte('season_year', FEATURED_END_YEAR)
    }

    if (season) {
      query = query.eq('season', season)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (genres) {
      const genreArray = genres.split(',').map((genre) => genre.trim()).filter(Boolean)
      if (genreArray.length > 0) {
        query = query.contains('genres', genreArray)
      }
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,english_title.ilike.%${search}%`)
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

    const result = await query.range(offset, offset + limit - 1)

    if (!result.error) {
      data = (result.data || []) as AnimeRow[]
      count = result.count || 0
      lastError = null
      break
    }

    lastError = result.error

    if (tableName !== 'animes_active') {
      break
    }
  }

  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 })
  }

  const anime = (data || []).map((row) => ({
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
    season: row.season,
    season_year: row.season_year,
    synopsis: row.synopsis,
    studios: row.main_studios || [],
    site_url: row.site_url,
  }))

  return NextResponse.json({
    season: buildWindowLabel(year, season),
    anime,
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit) || 1,
    featuredWindow: {
      startYear: FEATURED_START_YEAR,
      endYear: FEATURED_END_YEAR,
    },
  })
}
