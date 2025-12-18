'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, ChevronLeft, ChevronRight, X } from 'lucide-react'

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


const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function MonthlySchedule() {
  const [scheduleData, setScheduleData] = useState<Map<string, ScheduleItem[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  // Auto-select today on load
  const todayKey = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState<string | null>(todayKey)
  const [selectedAnime, setSelectedAnime] = useState<ScheduleItem[]>([])

  // Get the first day and last day of the current month view
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    // First day of the month
    const firstDay = new Date(year, month, 1)
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)

    // Start from the Sunday before the first day
    const startDate = new Date(firstDay)
    startDate.setDate(startDate.getDate() - firstDay.getDay())

    // End on the Saturday after the last day
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

  // Calculate which weeks to fetch
  const weeksToFetch = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get the Monday of the current week
    const currentMonday = new Date(today)
    const dayOfWeek = today.getDay()
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    currentMonday.setDate(today.getDate() + daysToMonday)

    // Get first calendar day
    const firstCalendarDay = calendarDays[0]

    // Calculate week offsets
    const weeks: number[] = []
    const msPerWeek = 7 * 24 * 60 * 60 * 1000

    // Start from the week containing the first calendar day
    const firstWeekMonday = new Date(firstCalendarDay)
    const firstDayOfWeek = firstCalendarDay.getDay()
    const daysToFirstMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek
    firstWeekMonday.setDate(firstCalendarDay.getDate() + daysToFirstMonday)

    const startOffset = Math.round((firstWeekMonday.getTime() - currentMonday.getTime()) / msPerWeek)

    // Fetch 6 weeks to cover the calendar view
    for (let i = 0; i < 6; i++) {
      weeks.push(startOffset + i)
    }

    return weeks
  }, [calendarDays])

  useEffect(() => {
    loadMonthSchedule()
  }, [weeksToFetch])

  // Update selected anime when schedule data loads (for auto-selected today)
  useEffect(() => {
    if (selectedDate && scheduleData.size > 0) {
      const anime = scheduleData.get(selectedDate) || []
      setSelectedAnime(anime)
    }
  }, [scheduleData, selectedDate])

  const loadMonthSchedule = async () => {
    setLoading(true)
    const newScheduleData = new Map<string, ScheduleItem[]>()

    try {
      // Fetch all weeks in parallel
      const weekPromises = weeksToFetch.map(offset =>
        fetch(`${API_URL}/anime/schedule/weekly?weeks_offset=${offset}`)
          .then(res => res.json())
          .catch(() => null)
      )

      const weekResults = await Promise.all(weekPromises)

      // Process each week's data
      weekResults.forEach(weekData => {
        if (!weekData?.schedule) return

        // Go through each day in the schedule
        Object.entries(weekData.schedule).forEach(([, items]) => {
          (items as ScheduleItem[]).forEach(item => {
            // Parse the airing_date to get the actual date
            const dateKey = item.airing_date
            if (!newScheduleData.has(dateKey)) {
              newScheduleData.set(dateKey, [])
            }
            newScheduleData.get(dateKey)!.push(item)
          })
        })
      })

      setScheduleData(newScheduleData)
    } catch (error) {
      console.error('Failed to load monthly schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDateKey = (date: Date): string => {
    return date.toISOString().split('T')[0]
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
    setCurrentDate(new Date())
    setSelectedDate(null)
    setSelectedAnime([])
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 md:w-8 md:h-8" />
            Monthly Schedule
          </h2>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
            {!loading && ` - ${totalEpisodes} episodes`}
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth(-1)}
            className="px-2 sm:px-3"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="px-2 sm:px-3"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth(1)}
            className="px-2 sm:px-3"
          >
            <span className="hidden sm:inline mr-1">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 xl:gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-4">
                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {DAYS_OF_WEEK.map(day => (
                    <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
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
                          relative aspect-[3/4] sm:aspect-square p-1 rounded-lg transition-all text-left flex flex-col justify-between
                          ${currentMonth ? 'bg-card' : 'bg-muted/30'}
                          ${today ? 'ring-2 ring-primary' : ''}
                          ${isSelected ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}
                          ${hasAnime ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-default'}
                        `}
                      >
                        <span className={`
                          text-sm font-medium
                          ${currentMonth ? 'text-foreground' : 'text-muted-foreground'}
                          ${today ? 'text-primary font-bold' : ''}
                        `}>
                          {date.getDate()}
                        </span>

                        {hasAnime && (
                          <div className="flex flex-col gap-0.5 w-full">
                            {finalesCount > 0 && (
                              <>
                                {/* Desktop: Full Badge */}
                                <div className="hidden sm:block text-[10px] font-bold rounded px-1 py-0.5 text-center truncate bg-amber-500 text-white shadow-sm">
                                  {finalesCount} Ends
                                </div>
                                {/* Mobile: Compact Dot */}
                                <div className="sm:hidden mx-auto w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm mb-0.5" />
                              </>
                            )}
                            <div className={`
                              text-[10px] font-medium rounded px-1 py-0.5 text-center truncate w-full
                              ${dayAnime.length > 5 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                            `}>
                              {dayAnime.length} <span className="hidden sm:inline">eps</span>
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Selected Day Panel */}
        {selectedDate && (
          <>
            {/* Mobile/tablet overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 xl:hidden"
              onClick={() => setSelectedDate(null)}
            />

            {/* Panel - Slide from LEFT on mobile, static on desktop */}
            <div className={`
              fixed inset-y-0 left-0 w-3/4 max-w-sm z-50 bg-background border-r shadow-2xl transition-transform duration-300 ease-in-out transform
              xl:relative xl:inset-auto xl:w-80 xl:shrink-0 xl:translate-x-0 xl:border-none xl:shadow-none xl:bg-transparent
              ${selectedDate ? 'translate-x-0' : '-translate-x-full'}
            `}>
              <Card className="h-full xl:sticky xl:top-20 overflow-hidden flex flex-col rounded-none xl:rounded-lg border-y-0 xl:border-y border-l-0 xl:border-l border-r-0 xl:border-r">
                <CardContent className="p-4 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-lg">
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </h3>
                      {selectedAnime.some(a => a.total_episodes && a.episode === a.total_episodes) && (
                        <span className="text-xs font-bold text-amber-500">
                          {selectedAnime.filter(a => a.total_episodes && a.episode === a.total_episodes).length} Finales
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(null)}
                      className="xl:hidden"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {selectedAnime.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-2">
                      <Clock className="w-8 h-8 opacity-20" />
                      <p className="text-sm">No episodes airing this day</p>
                    </div>
                  ) : (
                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                      {selectedAnime
                        .sort((a, b) => a.airing_at - b.airing_at)
                        .map((item) => {
                          const isFinale = item.total_episodes && item.episode === item.total_episodes

                          return (
                            <a
                              key={item.schedule_id}
                              href={`https://anilist.co/anime/${item.anime_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group"
                            >
                              <Card className={`overflow-hidden transition-all ${isFinale
                                ? 'border-amber-500 bg-amber-500/5 ring-1 ring-amber-500'
                                : 'hover:ring-2 hover:ring-primary border-transparent bg-muted/30 hover:bg-muted/50'
                                }`}>
                                <div className="flex gap-3 p-2">
                                  {item.cover_image && (
                                    <div className="relative shrink-0">
                                      <img
                                        src={item.cover_image}
                                        alt={item.title}
                                        className="w-12 h-16 object-cover rounded shadow-sm"
                                      />
                                      {isFinale && (
                                        <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap scale-90 origin-bottom-right">
                                          FINALE
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 py-0.5">
                                    <div className="flex justify-between items-start gap-2">
                                      <h4 className={`font-medium text-sm line-clamp-2 leading-tight ${isFinale ? 'text-amber-500' : 'text-foreground group-hover:text-primary transition-colors'}`}>
                                        {item.title}
                                      </h4>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                                      <span className={isFinale ? 'font-bold text-foreground' : ''}>Ep {item.episode}</span>
                                      {item.total_episodes && (
                                        <span>/ {item.total_episodes}</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Clock className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-xs font-medium text-primary">
                                        {item.airing_time}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            </a>
                          )
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
