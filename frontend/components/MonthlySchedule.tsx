'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import ScheduleEntryCard from '@/components/ScheduleEntryCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FEATURED_END_YEAR, FEATURED_START_YEAR } from '@/lib/dataset-window'
import {
  ScheduleFilter,
  ScheduleItem,
  ScheduleView,
  isFinale,
  isPremiere,
  matchesScheduleFilter,
} from '@/lib/schedule'
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  List,
  Loader2,
  Share2,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react'

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

interface ScheduleQueryState {
  date: Date | null
  selectedDate: string | null
  filter: ScheduleFilter
  view: ScheduleView
}

function readScheduleQueryState(): ScheduleQueryState {
  const fallback: ScheduleQueryState = {
    date: null,
    selectedDate: null,
    filter: 'all',
    view: 'calendar',
  }

  if (typeof window === 'undefined') return fallback

  const params = new URLSearchParams(window.location.search)
  const monthMatch = params.get('month')?.match(/^(\d{4})-(\d{2})$/)
  const year = monthMatch ? Number(monthMatch[1]) : null
  const month = monthMatch ? Number(monthMatch[2]) : null
  const date = year !== null && month !== null &&
    year >= FEATURED_START_YEAR && year <= FEATURED_END_YEAR &&
    month >= 1 && month <= 12
      ? new Date(year, month - 1, 1)
      : null

  const selectedDateParam = params.get('date')
  const selectedDate = selectedDateParam && /^\d{4}-\d{2}-\d{2}$/.test(selectedDateParam)
    ? selectedDateParam
    : null
  const filterParam = params.get('filter')
  const filter: ScheduleFilter = filterParam === 'premieres' || filterParam === 'finales'
    ? filterParam
    : 'all'
  const view: ScheduleView = params.get('mode') === 'agenda' ? 'agenda' : 'calendar'

  return { date, selectedDate, filter, view }
}

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
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [queryState] = useState(readScheduleQueryState)
  const todayKey = formatLocalDateKey(new Date())
  const [currentDate, setCurrentDate] = useState(queryState.date || initialDate || new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(
    queryState.selectedDate || (initialSelectedDate !== undefined ? initialSelectedDate : todayKey)
  )
  const [selectedAnime, setSelectedAnime] = useState<ScheduleItem[]>([])
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>(queryState.filter)
  const [viewMode, setViewMode] = useState<ScheduleView>(queryState.view)
  const [linkCopied, setLinkCopied] = useState(false)
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null)

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

    const url = new URL(window.location.href)
    url.searchParams.set('view', 'schedule')
    url.searchParams.set(
      'month',
      `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
    )
    if (selectedDate) url.searchParams.set('date', selectedDate)
    else url.searchParams.delete('date')
    if (scheduleFilter === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', scheduleFilter)
    if (viewMode === 'calendar') url.searchParams.delete('mode')
    else url.searchParams.set('mode', viewMode)

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [currentDate, selectedDate, scheduleFilter, viewMode, onStateChange])

  useEffect(() => () => {
    if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
  }, [])

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
      if (viewMode === 'agenda') {
        setSelectedDate(null)
        setSelectedAnime([])
        return
      }

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

  const changeViewMode = (nextView: ScheduleView) => {
    setViewMode(nextView)
    if (nextView === 'agenda') setSelectedDate(null)
  }

  const openMonthlyHighlights = (filter: Exclude<ScheduleFilter, 'all'>) => {
    setScheduleFilter(filter)
    setViewMode('agenda')
    setSelectedDate(null)
  }

  const copyScheduleLink = async () => {
    const scheduleUrl = window.location.href
    let copied = false

    try {
      await Promise.race([
        navigator.clipboard.writeText(scheduleUrl),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Clipboard request timed out')), 600)
        }),
      ])
      copied = true
    } catch {
      let temporaryInput: HTMLTextAreaElement | null = null
      try {
        temporaryInput = document.createElement('textarea')
        temporaryInput.value = scheduleUrl
        temporaryInput.setAttribute('readonly', '')
        temporaryInput.style.position = 'fixed'
        temporaryInput.style.opacity = '0'
        document.body.appendChild(temporaryInput)
        temporaryInput.select()
        copied = document.execCommand('copy')
      } catch {
        copied = false
      } finally {
        if (temporaryInput?.isConnected) document.body.removeChild(temporaryInput)
      }
    }

    if (copied) {
      setLinkCopied(true)
      setShareFallbackUrl(null)
      if (copyResetTimerRef.current) clearTimeout(copyResetTimerRef.current)
      copyResetTimerRef.current = setTimeout(() => setLinkCopied(false), 1800)
    } else {
      setLinkCopied(false)
      setShareFallbackUrl(scheduleUrl)
    }
  }

  const monthlyStats = useMemo(() => {
    let episodes = 0
    let premieres = 0
    let finales = 0
    const monthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-`
    scheduleData.forEach((items, dateKey) => {
      if (!dateKey.startsWith(monthPrefix)) return
      episodes += items.length
      premieres += items.filter(isPremiere).length
      finales += items.filter(isFinale).length
    })
    return { episodes, premieres, finales }
  }, [scheduleData, currentDate])

  const {
    episodes: totalEpisodes,
    premieres: totalPremieres,
    finales: totalFinales,
  } = monthlyStats

  const selectedPremieres = selectedAnime.filter(isPremiere).length
  const selectedFinales = selectedAnime.filter(isFinale).length
  const filteredSelectedAnime = useMemo(
    () => selectedAnime.filter(item => matchesScheduleFilter(item, scheduleFilter)),
    [selectedAnime, scheduleFilter]
  )

  const agendaGroups = useMemo(() => {
    const monthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-`
    return Array.from(scheduleData.entries())
      .filter(([dateKey]) => dateKey.startsWith(monthPrefix))
      .map(([dateKey, items]) => ({
        dateKey,
        items: items
          .filter(item => matchesScheduleFilter(item, scheduleFilter))
          .sort((a, b) => a.airing_at - b.airing_at),
      }))
      .filter(group => group.items.length > 0)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  }, [scheduleData, currentDate, scheduleFilter])

  const timeZoneLabel = useMemo(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local timezone'
    const shortName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value
    return shortName ? `${shortName} (${timeZone})` : timeZone
  }, [])

  const isFutureMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1) >
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)

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
          <div className="text-muted-foreground text-sm pl-[52px]">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading episodes...
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{totalEpisodes} episodes</span>
                {totalPremieres > 0 && (
                  <button
                    type="button"
                    onClick={() => openMonthlyHighlights('premieres')}
                    className="inline-flex items-center gap-1 text-primary font-semibold hover:underline underline-offset-4"
                    title="Show every premiere this month"
                  >
                    <Sparkles className="w-3 h-3" />
                    {totalPremieres} premiere{totalPremieres === 1 ? '' : 's'}
                  </button>
                )}
                {totalFinales > 0 && (
                  <button
                    type="button"
                    onClick={() => openMonthlyHighlights('finales')}
                    className="inline-flex items-center gap-1 text-amber-500 font-semibold hover:underline underline-offset-4"
                    title="Show every finale this month"
                  >
                    <Trophy className="w-3 h-3" />
                    {totalFinales} finale{totalFinales === 1 ? '' : 's'}
                  </button>
                )}
                <span>· {timeZoneLabel}</span>
              </span>
            )}
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={copyScheduleLink}
            aria-label={linkCopied ? 'Schedule link copied' : 'Copy schedule link'}
            className="border-border"
          >
            {linkCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4" />}
            <span className="hidden md:inline ml-1">{linkCopied ? 'Copied' : 'Share'}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in" style={{ animationDelay: '120ms' }}>
        <div className="flex items-center gap-1 surface-subtle rounded-xl p-1 overflow-x-auto hide-scrollbar" role="group" aria-label="Schedule filter">
          {([
            ['all', 'All', CalendarDays],
            ['premieres', 'Premieres', Sparkles],
            ['finales', 'Finales', Trophy],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScheduleFilter(value)}
              aria-pressed={scheduleFilter === value}
              className={`nav-pill flex items-center gap-1.5 whitespace-nowrap ${
                scheduleFilter === value ? 'nav-pill-active' : 'nav-pill-inactive'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 surface-subtle rounded-xl p-1" role="group" aria-label="Schedule view">
          <button
            type="button"
            onClick={() => changeViewMode('calendar')}
            aria-pressed={viewMode === 'calendar'}
            className={`nav-pill flex items-center gap-1.5 ${
              viewMode === 'calendar' ? 'nav-pill-active' : 'nav-pill-inactive'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Calendar
          </button>
          <button
            type="button"
            onClick={() => changeViewMode('agenda')}
            aria-pressed={viewMode === 'agenda'}
            className={`nav-pill flex items-center gap-1.5 ${
              viewMode === 'agenda' ? 'nav-pill-active' : 'nav-pill-inactive'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Agenda
          </button>
        </div>
      </div>

      {shareFallbackUrl && (
        <div className="surface-subtle px-3 py-2 flex items-center gap-2">
          <Share2 className="w-4 h-4 text-primary shrink-0" />
          <input
            aria-label="Shareable schedule link"
            readOnly
            value={shareFallbackUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShareFallbackUrl(null)}
            aria-label="Hide shareable link"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {isFutureMonth && (
        <div className="surface-subtle px-4 py-3 flex items-start gap-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p>
            Future schedule: only episodes with dates currently published by AniList are shown.
            More will appear as release dates are announced.
          </p>
        </div>
      )}

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
          ) : viewMode === 'calendar' ? (
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
                {calendarDays.map((date) => {
                  const dateKey = formatDateKey(date)
                  const dayAnime = (scheduleData.get(dateKey) || [])
                    .filter(item => matchesScheduleFilter(item, scheduleFilter))
                  const hasAnime = dayAnime.length > 0
                  const today = isToday(date)
                  const currentMonth = isCurrentMonth(date)
                  const isSelected = selectedDate === dateKey
                  const premieresCount = dayAnime.filter(isPremiere).length
                  const finalesCount = dayAnime.filter(isFinale).length
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
                      key={dateKey}
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
          ) : (
            <div className="surface-card overflow-hidden">
              {agendaGroups.length === 0 ? (
                <div className="px-6 py-16 flex flex-col items-center text-center text-muted-foreground">
                  <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                    <List className="w-7 h-7 opacity-40" />
                  </div>
                  <h3 className="font-display font-semibold text-foreground">No matching episodes</h3>
                  <p className="text-sm mt-1">
                    {scheduleFilter === 'premieres'
                      ? 'No premieres have been dated for this month.'
                      : scheduleFilter === 'finales'
                        ? 'No finales have been dated for this month.'
                        : 'AniList has not published dated episodes for this month yet.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {agendaGroups.map(group => {
                    const groupDate = new Date(`${group.dateKey}T00:00:00`)
                    const premiereCount = group.items.filter(isPremiere).length
                    const finaleCount = group.items.filter(isFinale).length

                    return (
                      <section key={group.dateKey} className="p-4 sm:p-6">
                        <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                              {groupDate.toLocaleDateString('en-US', { weekday: 'long' })}
                            </p>
                            <h3 className="font-display text-xl font-bold">
                              {groupDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] font-semibold">
                              <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                                {group.items.length} episode{group.items.length === 1 ? '' : 's'}
                              </span>
                              {premiereCount > 0 && (
                                <span className="premiere-badge rounded-full px-2 py-1">
                                  {premiereCount} premiere{premiereCount === 1 ? '' : 's'}
                                </span>
                              )}
                              {finaleCount > 0 && (
                                <span className="finale-badge rounded-full px-2 py-1">
                                  {finaleCount} finale{finaleCount === 1 ? '' : 's'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {group.items.map(item => (
                              <ScheduleEntryCard
                                key={item.schedule_id}
                                item={item}
                                formatTime={formatLocalTime}
                              />
                            ))}
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Day Panel */}
        {viewMode === 'calendar' && selectedDate && (
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
                  ) : filteredSelectedAnime.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-center">
                      <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                        <Clock className="w-7 h-7 opacity-30" />
                      </div>
                      <p className="text-sm font-medium">No matching episodes</p>
                      <p className="text-xs mt-1 opacity-70">
                        {scheduleFilter === 'premieres'
                          ? 'No premieres on this day'
                          : scheduleFilter === 'finales'
                            ? 'No finales on this day'
                            : 'Nothing airing this day'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...filteredSelectedAnime]
                        .sort((a, b) => a.airing_at - b.airing_at)
                        .map((item) => (
                          <ScheduleEntryCard
                            key={item.schedule_id}
                            item={item}
                            formatTime={formatLocalTime}
                          />
                        ))}
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
