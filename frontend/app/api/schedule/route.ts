import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TABLE_CANDIDATES = ['airing_schedule_active', 'airing_schedule'] as const
const PAGE_SIZE = 1000
const MAX_RANGE_DAYS = 62

type ScheduleRow = {
  id: number
  schedule_id: number | null
  anime_id: number
  episode: number
  airing_at: string
  title: string | null
  cover_image: string | null
  score: number | null
  total_episodes: number | null
  anime_status: string | null
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function airingStatus(airingAtMs: number, nowMs: number): string {
  if (airingAtMs <= nowMs) return 'aired'
  if (airingAtMs - nowMs <= 60 * 60 * 1000) return 'airing_soon'
  const airing = new Date(airingAtMs)
  const now = new Date(nowMs)
  if (airing.toDateString() === now.toDateString()) return 'airing_today'
  return 'upcoming'
}

function formatTimeUntil(airingAtMs: number, nowMs: number): string {
  const diffSeconds = Math.round((airingAtMs - nowMs) / 1000)
  const abs = Math.abs(diffSeconds)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)

  let label: string
  if (days > 0) label = `${days}d ${hours}h`
  else if (hours > 0) label = `${hours}h ${minutes}m`
  else label = `${minutes}m`

  return diffSeconds >= 0 ? `in ${label}` : `${label} ago`
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 7)
  const defaultEnd = new Date(now)
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 7)

  const start = parseDate(searchParams.get('start')) ?? defaultStart
  const end = parseDate(searchParams.get('end')) ?? defaultEnd

  if (end <= start) {
    return NextResponse.json({ error: 'end must be after start' }, { status: 400 })
  }
  if ((end.getTime() - start.getTime()) / 86400000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `range too large (max ${MAX_RANGE_DAYS} days)` }, { status: 400 })
  }

  let rows: ScheduleRow[] | null = null
  let lastError: { message: string } | null = null

  for (const tableName of TABLE_CANDIDATES) {
    const collected: ScheduleRow[] = []
    let pageError: { message: string } | null = null

    for (let from = 0; ; from += PAGE_SIZE) {
      const result = await supabase
        .from(tableName)
        .select('id, schedule_id, anime_id, episode, airing_at, title, cover_image, score, total_episodes, anime_status')
        .gte('airing_at', start.toISOString())
        .lt('airing_at', end.toISOString())
        .order('airing_at')
        .range(from, from + PAGE_SIZE - 1)

      if (result.error) {
        pageError = result.error
        break
      }

      collected.push(...((result.data || []) as ScheduleRow[]))
      if (!result.data || result.data.length < PAGE_SIZE) break
    }

    if (!pageError) {
      rows = collected
      lastError = null
      break
    }

    lastError = pageError
    if (tableName !== 'airing_schedule_active') break
  }

  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 })
  }

  const nowMs = Date.now()
  const items = (rows || []).map((row) => {
    const airingAtMs = new Date(row.airing_at).getTime()
    return {
      schedule_id: row.schedule_id ?? row.id,
      anime_id: row.anime_id,
      episode: row.episode,
      airing_at: Math.round(airingAtMs / 1000),
      title: row.title || 'Unknown',
      cover_image: row.cover_image,
      status: row.anime_status,
      total_episodes: row.total_episodes,
      score: row.score,
      airing_status: airingStatus(airingAtMs, nowMs),
      airs_in_human: formatTimeUntil(airingAtMs, nowMs),
      airing_time: new Date(airingAtMs).toISOString().slice(11, 16),
      airing_date: new Date(airingAtMs).toISOString().slice(0, 10),
    }
  })

  return NextResponse.json({
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    total: items.length,
    items,
  })
}
