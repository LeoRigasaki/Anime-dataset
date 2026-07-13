'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FEATURED_END_YEAR, FEATURED_START_YEAR } from '@/lib/dataset-window'
import { Calendar, Clock, ChevronLeft, ChevronRight, X, Loader2, Sparkles, Star, Trophy } from 'lucide-react'

interface ScheduleItem {
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

interface MonthlyScheduleProps {
  initialDate?: Date
  initialSelectedDate?: string | null
  onStateChange?: (date: Date, selectedDate: string | null) => void
  showAdult?: boolean
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const YEAR_OPTIONS = Array.from(
  { length: FEATURED_END_YEAR - FEATURED_START_YEAR + 1 },
  (_, index) => FEATURED_START_YEAR + index
)

export default function MonthlySchedule({
  initialDate,
  initialSelectedDate,
  onStateChange,
  showAdult = false
}: MonthlyScheduleProps) {
  const formatLocalDateKey = useCallback((date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }, [])

  const formatLocalTime = useCallback((timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }, [])

  const [scheduleData, setScheduleData] = useState<Map<string, ScheduleItem[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const rangeCache = useRef<Map<string, Map<string, ScheduleItem[]>>>(new Map())
  const skipDefaultSelectionRef = useRef(false)
  const loadRequestIdRef = useRef(0)

  const todayKey = formatLocalDateKey(new Date())
  const [currentDate, setCurrentDate] = useState(initialDate || new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(
    initialSelectedDate !== undefined ? initialSelectedDate : todayKey
  )
  const [selectedAnime, setSelectedAnime] = useState<ScheduleItem[]>([])

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    const endDate = new Date(lastDay)
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()))

    const days: Date[] = []
    const current = new Date(startDate)
    while (current <= endDate) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return days
  }, [currentDate])

  useEffect(() => {
    loadMonthSchedule()
  }, [calendarDays, showAdult])

  useEffect(() => {
    if (selectedDate && scheduleData.size > 0) {
      const anime = scheduleData.get(selectedDate) || []
      setSelectedAnime(anime)
    }
  }, [scheduleData, selectedDate])

  useEffect(() => {
    onStateChange?.(currentDate, selectedDate)
  }, [currentDate, selectedDate, onStateChange])

  const loadMonthSchedule = async () => {
    const requestId = ++loadRequestIdRef.current

    // Fetch the whole visible calendar range in one request, padded a day on
    // each side so local-timezone grouping never misses boundary episodes.
    const rangeStart = new Date(calendarDays[0])
    rangeStart.setDate(rangeStart.getDate() - 1)
    const rangeEnd = new Date(calendarDays[calendarDays.length - 1])
    rangeEnd.setDate(rangeEnd.getDate() + 2)

    const startKey = formatLocalDateKey(rangeStart)
    const endKey = formatLocalDateKey(rangeEnd)
    const cacheKey = `${startKey}_${endKey}_${showAdult ? 'adult' : 'sfw'}`

    const cached = rangeCache.current.get(cacheKey)
    if (cached) {
      if (requestId !== loadRequestIdRef.current) return
      setScheduleData(cached)
      applyDefaultSelection(cached)
      return
    }

    setLoading(true)
    setLoadError(false)
    const newScheduleData = new Map<string, ScheduleItem[]>()

    try {
      const res = await fetch(`/api/schedule?start=${startKey}&end=${endKey}${showAdult ? '&adult=true' : ''}`)
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      for (const item of (data.items || []) as ScheduleItem[]) {
        const localDateKey = formatLocalDateKey(new Date(item.airing_at * 1000))
        if (!newScheduleData.has(localDateKey)) {
          newScheduleData.set(localDateKey, [])
        }
        newScheduleData.get(localDateKey)!.push({
          ...item,
          airing_date: localDateKey
        })
      }

      rangeCache.current.set(cacheKey, newScheduleData)
      if (requestId !== loadRequestIdRef.current) return
      setScheduleData(newScheduleData)
      applyDefaultSelection(newScheduleData)
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return
      console.error('Failed to load monthly schedule:', error)
      setLoadError(true)
      setScheduleData(new Map())
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false)
    }
  }

  const applyDefaultSelection = (newScheduleData: Map<string, ScheduleItem[]>) => {
    {
      if (skipDefaultSelectionRef.current) {
        skipDefaultSelectionRef.current = false
        setSelectedDate(null)
        setSelectedAnime([])
        return
      }

      if (!selectedDate || !newScheduleData.has(selectedDate)) {
        const today = new Date()
        const todayStr = formatLocalDateKey(today)

        if (today.getMonth() === currentDate.getMonth() &&
            today.getFullYear() === currentDate.getFullYear()) {
          setSelectedDate(todayStr)
          setSelectedAnime(newScheduleData.get(todayStr) || [])
        } else {
          const firstOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
          const firstKey = formatLocalDateKey(firstOfMonth)

          const monthDays = calendarDays.filter(d =>
            d.getMonth() === currentDate.getMonth() &&
            d.getFullYear() === currentDate.getFullYear()
          )

          const firstDayWithAnime = monthDays.find(d => {
            const key = formatLocalDateKey(d)
            return newScheduleData.has(key) && newScheduleData.get(key)!.length > 0
          })

          if (firstDayWithAnime) {
            const key = formatLocalDateKey(firstDayWithAnime)
            setSelectedDate(key)
            setSelectedAnime(newScheduleData.get(key) || [])
          } else {
            setSelectedDate(firstKey)
            setSelectedAnime([])
          }
        }
      }
    }
  }

  const formatDateKey = (date: Date): string => {
    return formatLocalDateKey(date)
  }

  const isToday = (date: Date): boolean => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth()
  }

  const navigateMonth = (direction: number) => {
    const newDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + direction,
      1
    )
    loadRequestIdRef.current += 1
    skipDefaultSelectionRef.current = true
    setCurrentDate(newDate)
    setSelectedDate(null)
    setSelectedAnime([])
  }

  const jumpToMonth = (month: number, year: number) => {
    loadRequestIdRef.current += 1
    skipDefaultSelectionRef.current = true
    setCurrentDate(new Date(year, month, 1))
    setSelectedDate(null)
    setSelectedAnime([])
  }

  const goToToday = () => {
    const today = new Date()
    loadRequestIdRef.current += 1
    skipDefaultSelectionRef.current = false
    setCurrentDate(today)
    const todayStr = formatLocalDateKey(today)
    setSelectedDate(todayStr)
    setSelectedAnime(scheduleData.get(todayStr) || [])
  }

  const handleDateClick = (date: Date) => {
    const dateKey = formatDateKey(date)
    const anime = scheduleData.get(dateKey) || []
    setSelectedDate(dateKey)
    setSelectedAnime(anime)
  }

  const monthlyStats = useMemo(() => {
    let episodes = 0
    let premieres = 0
    let finales = 0
    const monthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-`
    scheduleData.forEach((items, dateKey) => {
      if (!dateKey.startsWith(monthPrefix)) return
      episodes += items.length
      premieres += items.filter(item => item.episode === 1).length
      finales += items.filter(
        item => item.total_episodes && item.episode === item.total_episodes
      ).length
    })
    return { episodes, premieres, finales }
  }, [scheduleData, currentDate])

  const {
    episodes: totalEpisodes,
    premieres: totalPremieres,
    finales: totalFinales,
  } = monthlyStats

  const selectedPremieres = selectedAnime.filter(item => item.episode === 1).length
  const selectedFinales = selectedAnime.filter(
    item => item.total_episodes && item.episode === item.total_episodes
  ).length

  const atFirstMonth = currentDate.getFullYear() === FEATURED_START_YEAR && currentDate.getMonth() === 0
  const atLastMonth = currentDate.getFullYear() === FEATURED_END_YEAR && currentDate.getMonth() === 11

  // Premium Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="surface-card p-6">
      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-2 mb-3">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Skeleton Calendar Days */}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[3/4] sm:aspect-square rounded-xl shimmer"
          />
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={String(currentDate.getMonth())}
                onValueChange={(value) => jumpToMonth(Number(value), currentDate.getFullYear())}
                disabled={loading}
              >
                <SelectTrigger
                  aria-label="Select schedule month"
                  className="h-10 w-[150px] sm:w-[170px] border-border bg-card px-3 font-display text-lg sm:text-xl font-bold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((month, index) => (
                    <SelectItem key={month} value={String(index)}>{month}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(currentDate.getFullYear())}
                onValueChange={(value) => jumpToMonth(currentDate.getMonth(), Number(value))}
                disabled={loading}
              >
                <SelectTrigger
                  aria-label="Select schedule year"
                  className="h-10 w-[96px] border-border bg-card px-3 font-display text-lg sm:text-xl font-bold text-muted-foreground"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEAR_OPTIONS.map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground text-sm pl-[52px]">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading episodes...
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{totalEpisodes} episodes</span>
                {totalPremieres > 0 && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <Sparkles className="w-3 h-3" />
                    {totalPremieres} premiere{totalPremieres === 1 ? '' : 's'}
                  </span>
                )}
                {totalFinales > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-500">
                    <Trophy className="w-3 h-3" />
                    {totalFinales} finale{totalFinales === 1 ? '' : 's'}
                  </span>
                )}
                <span>· times shown in your local timezone</span>
              </span>
            )}
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth(-1)}
            disabled={loading || atFirstMonth}
            aria-label="Previous month"
            className="border-border"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Prev</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={loading}
            className="border-border px-4"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth(1)}
            disabled={loading || atLastMonth}
            aria-label="Next month"
            className="border-border"
          >
            <span className="hidden sm:inline mr-1">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0 animate-fade-in" style={{ animationDelay: '150ms' }}>
          {loading ? (
            <LoadingSkeleton />
          ) : loadError ? (
            <div className="surface-card p-10 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <X className="w-7 h-7 text-destructive" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-1">Couldn&apos;t load the schedule</h3>
              <p className="text-muted-foreground text-sm mb-4">Check your connection and try again.</p>
              <Button variant="outline" size="sm" onClick={loadMonthSchedule}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="surface-card p-4 sm:p-6">
              {totalEpisodes === 0 && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-secondary border border-border text-sm text-muted-foreground">
                  No episode data for this month — AniList has not published dated episodes for it yet.
                </div>
              )}
              {/* Day Headers */}
              <div className="grid grid-cols-7 gap-2 mb-3">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {calendarDays.map((date, index) => {
                  const dateKey = formatDateKey(date)
                  const dayAnime = scheduleData.get(dateKey) || []
                  const hasAnime = dayAnime.length > 0
                  const today = isToday(date)
                  const currentMonth = isCurrentMonth(date)
                  const isSelected = selectedDate === dateKey
                  const premieresCount = dayAnime.filter(a => a.episode === 1).length
                  const finalesCount = dayAnime.filter(a => a.total_episodes && a.episode === a.total_episodes).length
                  const dateLabel = [
                    date.toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                    }),
                    hasAnime ? `${dayAnime.length} episode${dayAnime.length === 1 ? '' : 's'}` : 'No episodes',
                    premieresCount > 0 ? `${premieresCount} premiere${premieresCount === 1 ? '' : 's'}` : null,
                    finalesCount > 0 ? `${finalesCount} finale${finalesCount === 1 ? '' : 's'}` : null,
                  ].filter(Boolean).join(', ')

                  return (
                    <button
                      key={index}
                      onClick={() => handleDateClick(date)}
                      aria-label={dateLabel}
                      className={`
                        relative aspect-[3/4] sm:aspect-square p-1.5 sm:p-2 rounded-xl transition-all duration-200 text-left flex flex-col
                        ${currentMonth ? 'calendar-day' : 'bg-muted/10 opacity-40'}
                        ${today ? 'calendar-day-today' : ''}
                        ${isSelected ? 'calendar-day-selected' : ''}
                        ${hasAnime ? 'calendar-day-has-anime' : ''}
                      `}
                    >
                      <span className={`
                        text-sm font-semibold
                        ${currentMonth ? 'text-foreground' : 'text-muted-foreground'}
                        ${today ? 'text-primary' : ''}
                        ${isSelected ? 'text-primary' : ''}
                      `}>
                        {date.getDate()}
                      </span>

                      {hasAnime && (
                        <div className="mt-auto flex flex-col gap-1 w-full">
                          {(premieresCount > 0 || finalesCount > 0) && (
                            <div className="hidden sm:flex flex-col gap-1">
                              {premieresCount > 0 && (
                                <div className="flex items-center justify-center gap-1 text-[9px] font-bold rounded-md px-1.5 py-0.5 premiere-badge">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  {premieresCount} Premiere{premieresCount > 1 ? 's' : ''}
                                </div>
                              )}
                              {finalesCount > 0 && (
                                <div className="flex items-center justify-center gap-1 text-[9px] font-bold rounded-md px-1.5 py-0.5 finale-badge">
                                  <Trophy className="w-2.5 h-2.5" />
                                  {finalesCount} End{finalesCount > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          )}
                          {(premieresCount > 0 || finalesCount > 0) && (
                            <div className="sm:hidden flex items-center justify-center gap-1.5" aria-hidden="true">
                              {premieresCount > 0 && (
                                <div className="w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50" />
                              )}
                              {finalesCount > 0 && (
                                <div className="w-2 h-2 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                              )}
                            </div>
                          )}
                          <div className={`
                            text-[10px] font-semibold rounded-md px-1.5 py-0.5 text-center truncate w-full
                            ${dayAnime.length > 5
                              ? 'bg-primary/20 text-primary border border-primary/30'
                              : 'bg-muted/50 text-muted-foreground'
                            }
                          `}>
                            {dayAnime.length} <span className="hidden sm:inline">eps</span>
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected Day Panel */}
        {selectedDate && (
          <>
            {/* Mobile/tablet overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 xl:hidden animate-fade-in"
              onClick={() => setSelectedDate(null)}
            />

            {/* Panel */}
            <div className={`
              fixed inset-y-0 left-0 w-[85%] max-w-sm z-50 transition-transform duration-300 ease-out
              xl:relative xl:inset-auto xl:w-80 xl:shrink-0 xl:translate-x-0
              ${selectedDate ? 'translate-x-0' : '-translate-x-full'}
            `}>
              <div className="surface-card h-full xl:sticky xl:top-24 overflow-hidden flex flex-col rounded-none xl:rounded-xl border-r xl:border-r-0 border-border">
                <div className="p-5 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </h3>
                      {(selectedPremieres > 0 || selectedFinales > 0) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {selectedPremieres > 0 && (
                            <div className="flex items-center gap-1.5 text-primary">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">
                                {selectedPremieres} Premiere{selectedPremieres > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                          {selectedFinales > 0 && (
                            <div className="flex items-center gap-1.5 text-amber-500">
                              <Trophy className="w-3.5 h-3.5" />
                              <span className="text-xs font-semibold">
                                {selectedFinales} Finale{selectedFinales > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(null)}
                      aria-label="Close selected day"
                      className="xl:hidden hover:bg-accent rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                      <p className="text-sm">Loading episodes...</p>
                    </div>
                  ) : selectedAnime.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center">
                      <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                        <Clock className="w-7 h-7 opacity-30" />
                      </div>
                      <p className="text-sm font-medium">No episodes</p>
                      <p className="text-xs mt-1 opacity-70">Nothing airing this day</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...selectedAnime]
                        .sort((a, b) => a.airing_at - b.airing_at)
                        .map((item) => {
                          const isPremiere = item.episode === 1
                          const isFinale = item.total_episodes && item.episode === item.total_episodes

                          return (
                            <a
                              key={item.schedule_id}
                              href={`https://anilist.co/anime/${item.anime_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group"
                            >
                              <div className={`
                                surface-subtle rounded-xl overflow-hidden transition-all duration-200
                                ${isPremiere
                                  ? 'ring-1 ring-primary/60 bg-primary/5'
                                  : isFinale
                                  ? 'ring-1 ring-amber-500/50 bg-amber-500/5'
                                  : 'hover:bg-accent'
                                }
                              `}>
                                <div className="flex gap-3 p-3">
                                  {item.cover_image && (
                                    <div className="relative shrink-0">
                                      <Image
                                        src={item.cover_image}
                                        alt={item.title}
                                        width={56}
                                        height={80}
                                        className="w-14 h-20 object-cover rounded-lg shadow-lg"
                                      />
                                      {isFinale && (
                                        <div className="absolute -bottom-1 -right-1 finale-badge text-[8px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                          <Trophy className="w-2 h-2" />
                                          END
                                        </div>
                                      )}
                                      {item.score ? (
                                        <div className="absolute -top-1 -left-1 score-badge text-[9px] px-1 py-0.5 flex items-center gap-0.5">
                                          <Star className="w-2 h-2 text-amber-400 fill-amber-400" />
                                          {item.score}
                                        </div>
                                      ) : null}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 py-0.5">
                                    {isPremiere && (
                                      <div className="mb-1.5">
                                        <span className="premiere-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] tracking-wide">
                                          <Sparkles className="w-2.5 h-2.5" />
                                          PREMIERE
                                        </span>
                                      </div>
                                    )}
                                    <h4 className={`
                                      font-medium text-sm line-clamp-2 leading-snug mb-1.5 transition-colors
                                      ${isPremiere
                                        ? 'text-primary'
                                        : isFinale
                                          ? 'text-amber-400'
                                          : 'text-foreground group-hover:text-primary'
                                      }
                                    `}>
                                      {item.title}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className={`font-semibold ${isPremiere ? 'text-primary' : isFinale ? 'text-amber-400' : ''}`}>
                                        Ep {item.episode}
                                      </span>
                                      {item.total_episodes && (
                                        <>
                                          <span className="opacity-50">/</span>
                                          <span>{item.total_episodes}</span>
                                        </>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-2">
                                      <Clock className="w-3 h-3 text-primary" />
                                      <span className="text-xs font-semibold text-primary">
                                        {formatLocalTime(item.airing_at)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </a>
                          )
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
