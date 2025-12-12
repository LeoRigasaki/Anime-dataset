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
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
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

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Calendar Grid */}
        <div className="flex-1">
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

                    return (
                      <button
                        key={index}
                        onClick={() => handleDateClick(date)}
                        className={`
                          relative aspect-square p-1 rounded-lg transition-all text-left
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
                          <div className="absolute bottom-1 left-1 right-1">
                            <div className={`
                              text-xs font-medium rounded px-1 py-0.5 text-center truncate
                              ${dayAnime.length > 5 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                            `}>
                              {dayAnime.length} ep{dayAnime.length !== 1 ? 's' : ''}
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

        {/* Selected Day Panel - Shows as overlay on mobile, side panel on desktop */}
        {selectedDate && (
          <>
            {/* Mobile overlay backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => {
                setSelectedDate(null)
                setSelectedAnime([])
              }}
            />

            {/* Panel - fixed on mobile, static on desktop */}
            <div className="fixed inset-x-4 bottom-4 top-auto max-h-[70vh] z-50 lg:relative lg:inset-auto lg:w-80 lg:shrink-0 lg:max-h-none lg:z-auto">
              <Card className="lg:sticky lg:top-20 h-full">
                <CardContent className="p-4 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedDate(null)
                        setSelectedAnime([])
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {selectedAnime.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No episodes airing this day</p>
                  ) : (
                    <div className="space-y-3 overflow-y-auto flex-1">
                      {selectedAnime
                        .sort((a, b) => a.airing_at - b.airing_at)
                        .map((item) => (
                        <a
                          key={item.schedule_id}
                          href={`https://anilist.co/anime/${item.anime_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <Card className="overflow-hidden hover:ring-2 hover:ring-primary transition-all">
                            <div className="flex gap-3 p-2">
                              {item.cover_image && (
                                <img
                                  src={item.cover_image}
                                  alt={item.title}
                                  className="w-12 h-16 object-cover rounded"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm line-clamp-2 leading-tight">
                                  {item.title}
                                </h4>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <span>Ep {item.episode}</span>
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
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Desktop only: Placeholder when no date selected */}
        <div className="hidden lg:block w-80 shrink-0">
          {!selectedDate && (
            <Card className="sticky top-20">
              <CardContent className="p-4">
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select a day to see episodes</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
