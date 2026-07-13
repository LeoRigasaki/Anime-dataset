export interface ScheduleItem {
  schedule_id: number
  airing_at: number
  episode: number
  anime_id: number
  title: string
  cover_image: string
  status: string
  total_episodes: number | null
  score: number
  airs_in_human: string
  airing_status: 'aired' | 'airing_soon' | 'airing_today' | 'upcoming'
  airing_time: string
  airing_date: string
}

export type ScheduleFilter = 'all' | 'premieres' | 'finales'
export type ScheduleView = 'calendar' | 'agenda'

export function isPremiere(item: ScheduleItem): boolean {
  return item.episode === 1
}

export function isFinale(item: ScheduleItem): boolean {
  return Boolean(item.total_episodes && item.episode === item.total_episodes)
}

export function matchesScheduleFilter(
  item: ScheduleItem,
  filter: ScheduleFilter
): boolean {
  if (filter === 'premieres') return isPremiere(item)
  if (filter === 'finales') return isFinale(item)
  return true
}

