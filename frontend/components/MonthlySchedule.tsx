'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function MonthlySchedule({
  initialDate,
  initialSelectedDate,
  onStateChange
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
  const [loadingProgress, setLoadingProgress] = useState(0)

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

  const weeksToFetch = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const currentMonday = new Date(today)
    const dayOfWeek = today.getDay()
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    currentMonday.setDate(today.getDate() + daysToMonday)

    const firstCalendarDay = calendarDays[0]
    const weeks: number[] = []
    const msPerWeek = 7 * 24 * 60 * 60 * 1000

    const firstWeekMonday = new Date(firstCalendarDay)
    const firstDayOfWeek = firstCalendarDay.getDay()
    const daysToFirstMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek
    firstWeekMonday.setDate(firstCalendarDay.getDate() + daysToFirstMonday)

    const startOffset = Math.round((firstWeekMonday.getTime() - currentMonday.getTime()) / msPerWeek)

    for (let i = 0; i < 6; i++) {
      weeks.push(startOffset + i)
    }

    return weeks
  }, [calendarDays])

  useEffect(() => {
    loadMonthSchedule()
  }, [weeksToFetch])

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
    setLoading(true)
    setLoadingProgress(0)
    const newScheduleData = new Map<string, ScheduleItem[]>()

    try {
      let completedWeeks = 0

      for (const offset of weeksToFetch) {
        try {
          const res = await fetch(`${API_URL}/anime/schedule/weekly?weeks_offset=${offset}`)
          const weekData = await res.json()

          if (weekData?.schedule) {
            Object.entries(weekData.schedule).forEach(([, items]) => {
              (items as ScheduleItem[]).forEach(item => {
                const airingDate = new Date(item.airing_at * 1000)
                const localDateKey = formatLocalDateKey(airingDate)

                if (!newScheduleData.has(localDateKey)) {
                  newScheduleData.set(localDateKey, [])
                }
                newScheduleData.get(localDateKey)!.push({
                  ...item,
                  airing_date: localDateKey
                })
              })
            })
          }
        } catch (err) {
          console.warn(`Failed to fetch week ${offset}:`, err)
        }

        completedWeeks++
        setLoadingProgress(Math.round((completedWeeks / weeksToFetch.length) * 100))

        if (completedWeeks < weeksToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      setScheduleData(newScheduleData)

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
    } catch (error) {
      console.error('Failed to load monthly schedule:', error)
    } finally {
      setLoading(false)
      setLoadingProgress(100)
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
    const newDate = new Date(currentDate)
    newDate.setMonth(newDate.getMonth() + direction)
    setCurrentDate(newDate)
    setSelectedDate(null)
    setSelectedAnime([])
  }

  const goToToday = () => {
    const today = new Date()
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

  const totalEpisodes = useMemo(() => {
    let count = 0
    scheduleData.forEach(items => count += items.length)
    return count
  }, [scheduleData])

  // Premium Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="glass-card p-6">
      {/* Progress indicator */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Loading schedule...</span>
          </span>
          <span className="text-primary font-semibold">{loadingProgress}%</span>
        </div>
        <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full progress-glow transition-all duration-300 ease-out"
            style={{ width: `${loadingProgress}%` }}
          />
        </div>
      </div>

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
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-accent" />
              </div>
              <div className="absolute -inset-1 bg-accent/10 rounded-xl blur-lg -z-10" />
            </div>
            <div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
                {MONTH_NAMES[currentDate.getMonth()]} <span className="text-muted-foreground">{currentDate.getFullYear()}</span>
              </h2>
            </div>
          </div>
          <p className="text-muted-foreground text-sm pl-[52px]">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading episodes...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-primary" />
                {totalEpisodes} episodes this month
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
            disabled={loading}
            className="glass-subtle border-white/5 hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Prev</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={loading}
            className="glass-subtle border-white/5 hover:bg-white/5 px-4"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth(1)}
            disabled={loading}
            className="glass-subtle border-white/5 hover:bg-white/5"
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
          ) : (
            <div className="glass-card p-4 sm:p-6">
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
                  const finalesCount = dayAnime.filter(a => a.total_episodes && a.episode === a.total_episodes).length

                  return (
                    <button
                      key={index}
                      onClick={() => handleDateClick(date)}
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
                        ${isSelected ? 'text-accent' : ''}
                      `}>
                        {date.getDate()}
                      </span>

                      {hasAnime && (
                        <div className="mt-auto flex flex-col gap-1 w-full">
                          {finalesCount > 0 && (
                            <>
                              {/* Desktop: Full Badge */}
                              <div className="hidden sm:flex items-center justify-center gap-1 text-[9px] font-bold rounded-md px-1.5 py-0.5 finale-badge">
                                <Trophy className="w-2.5 h-2.5" />
                                {finalesCount} End{finalesCount > 1 ? 's' : ''}
                              </div>
                              {/* Mobile: Compact Dot */}
                              <div className="sm:hidden mx-auto w-2 h-2 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" />
                            </>
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
              <div className="glass-card h-full xl:sticky xl:top-24 overflow-hidden flex flex-col rounded-none xl:rounded-xl border-r xl:border-r-0 border-white/5">
                <div className="p-5 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-lg">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </h3>
                      {selectedAnime.some(a => a.total_episodes && a.episode === a.total_episodes) && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold text-amber-500">
                            {selectedAnime.filter(a => a.total_episodes && a.episode === a.total_episodes).length} Finale{selectedAnime.filter(a => a.total_episodes && a.episode === a.total_episodes).length > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(null)}
                      className="xl:hidden hover:bg-white/5 rounded-lg"
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
                      {selectedAnime
                        .sort((a, b) => a.airing_at - b.airing_at)
                        .map((item, index) => {
                          const isFinale = item.total_episodes && item.episode === item.total_episodes

                          return (
                            <a
                              key={item.schedule_id}
                              href={`https://anilist.co/anime/${item.anime_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group animate-fade-in"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <div className={`
                                glass-subtle rounded-xl overflow-hidden transition-all duration-200
                                ${isFinale
                                  ? 'ring-1 ring-amber-500/50 bg-amber-500/5'
                                  : 'hover:bg-white/5'
                                }
                              `}>
                                <div className="flex gap-3 p-3">
                                  {item.cover_image && (
                                    <div className="relative shrink-0">
                                      <img
                                        src={item.cover_image}
                                        alt={item.title}
                                        className="w-14 h-20 object-cover rounded-lg shadow-lg"
                                      />
                                      {isFinale && (
                                        <div className="absolute -bottom-1 -right-1 finale-badge text-[8px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                          <Trophy className="w-2 h-2" />
                                          END
                                        </div>
                                      )}
                                      {item.score && (
                                        <div className="absolute -top-1 -left-1 score-badge text-[9px] px-1 py-0.5 flex items-center gap-0.5">
                                          <Star className="w-2 h-2 text-amber-400 fill-amber-400" />
                                          {item.score}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 py-0.5">
                                    <h4 className={`
                                      font-medium text-sm line-clamp-2 leading-snug mb-1.5 transition-colors
                                      ${isFinale ? 'text-amber-400' : 'text-foreground group-hover:text-primary'}
                                    `}>
                                      {item.title}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className={`font-semibold ${isFinale ? 'text-amber-400' : ''}`}>
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
                                      <Clock className="w-3 h-3 text-accent" />
                                      <span className="text-xs font-semibold text-accent">
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
