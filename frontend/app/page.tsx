'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Calendar, Clock, Filter, PlayCircle, CheckCircle2, X, Sparkles, Search, Star, ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import MonthlySchedule from '@/components/MonthlySchedule'

interface Anime {
  anime_id: number
  title: string
  romaji_title?: string
  status: string
  episodes?: number
  current_episode?: number
  predicted_completion?: string
  cover_image?: string
  score?: number
  genres?: string[]
  is_adult?: boolean
  season?: string
  season_year?: number
  synopsis?: string
  studios?: string[]
  site_url?: string
  start_date?: string
  next_airing_episode_at?: number
  next_episode_number?: number
}

type Tab = 'browse' | 'schedule'
type StatusFilter = 'all' | 'releasing' | 'finished' | 'upcoming'
type SortOption = 'popularity' | 'end_date' | 'score'

const stripHtml = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3600000)
  if (hours < 1) return 'less than an hour ago'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('browse')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [animeList, setAnimeList] = useState<Anime[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('popularity')
  const [seasonInfo, setSeasonInfo] = useState('')
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])
  const [allGenres, setAllGenres] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAnime, setTotalAnime] = useState(0)
  const [showGenreDropdown, setShowGenreDropdown] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdult, setShowAdult] = useState(false)
  const [dataUpdatedAt, setDataUpdatedAt] = useState<string | null>(null)
  const [detailAnime, setDetailAnime] = useState<Anime | null>(null)
  const genreDropdownRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // State persistence for schedule tab
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date())
  const [scheduleSelectedDate, setScheduleSelectedDate] = useState<string | null>(null)

  const handleScheduleStateChange = (date: Date, selectedDate: string | null) => {
    setScheduleDate(date)
    setScheduleSelectedDate(selectedDate)
  }

  // Restore the 18+ preference
  useEffect(() => {
    setShowAdult(localStorage.getItem('showAdult') === '1')
  }, [])

  const toggleAdult = (value: boolean) => {
    setShowAdult(value)
    localStorage.setItem('showAdult', value ? '1' : '0')
    setCurrentPage(1)
  }

  // Fetch genre list (refreshed when the 18+ toggle changes)
  useEffect(() => {
    fetch(`/api/anime/genres${showAdult ? '?adult=true' : ''}`)
      .then(res => res.json())
      .then(data => setAllGenres(data.genres || []))
      .catch(() => {
        setAllGenres(['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
          'Horror', 'Mecha', 'Music', 'Mystery', 'Psychological',
          'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'])
      })
  }, [showAdult])

  // Fetch data freshness on mount
  useEffect(() => {
    fetch('/api/meta')
      .then(res => res.json())
      .then(data => setDataUpdatedAt(data.updated_at || null))
      .catch(() => setDataUpdatedAt(null))
  }, [])

  // Debounce the search box into the actual query
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Close genre dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target as Node)) {
        setShowGenreDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadAnimeData = useCallback(async () => {
    // Cancel any in-flight request so rapid filter changes can't race
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        const statusMap: Record<string, string> = {
          releasing: 'RELEASING',
          finished: 'FINISHED',
          upcoming: 'NOT_YET_RELEASED',
        }
        params.set('status', statusMap[statusFilter])
      }
      if (selectedGenres.length > 0) {
        params.set('genres', selectedGenres.join(','))
      }
      if (searchQuery) {
        params.set('search', searchQuery)
      }
      if (showAdult) {
        params.set('adult', 'true')
      }
      params.set('sort', sortBy)
      params.set('page', String(currentPage))
      params.set('limit', '30')

      const res = await fetch(`/api/anime?${params.toString()}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnimeList(data.anime || [])
      setSeasonInfo(data.season || '')
      setTotalPages(data.totalPages || 1)
      setTotalAnime(data.total || 0)
      setLoading(false)
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Failed to load anime:', error)
      setLoadError('Could not load the catalog. Check your connection and try again.')
      setAnimeList([])
      setLoading(false)
    }
  }, [statusFilter, selectedGenres, sortBy, currentPage, searchQuery, showAdult])

  useEffect(() => {
    if (tab === 'browse') {
      loadAnimeData()
    }
  }, [tab, loadAnimeData])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleGenreToggle = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre)
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    )
    setCurrentPage(1)
  }

  const handleStatusFilterChange = (key: StatusFilter) => {
    setStatusFilter(key)
    setCurrentPage(1)
  }

  const handleSortChange = (value: string) => {
    setSortBy(value as SortOption)
    setCurrentPage(1)
  }

  const AnimeCard = ({ anime, index = 0 }: { anime: Anime; index?: number }) => (
    <button
      onClick={() => setDetailAnime(anime)}
      className="block h-full w-full text-left animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <div className="anime-card h-full group">
        <div className="anime-card-image aspect-[2/3] relative">
          {anime.cover_image ? (
            <Image
              src={anime.cover_image}
              alt={anime.title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Sparkles className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}

          {/* Score Badge */}
          {anime.score ? (
            <div className="absolute top-3 left-3 score-badge flex items-center gap-1 z-10">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-white">{anime.score}%</span>
            </div>
          ) : null}

          {/* Status Badge */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end z-10">
            {anime.status && (
              <div className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold tracking-wide uppercase ${
                anime.status === 'FINISHED' ? 'status-finished' :
                anime.status === 'RELEASING' ? 'status-airing' :
                'status-upcoming'
              }`}>
                {anime.status === 'FINISHED' ? 'Finished' :
                 anime.status === 'RELEASING' ? 'Airing' : 'Soon'}
              </div>
            )}
            {anime.is_adult && (
              <div className="px-2 py-1 rounded-lg bg-red-700 text-white text-[10px] font-bold">
                18+
              </div>
            )}
          </div>

          {/* Content Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="font-display font-semibold text-sm text-white line-clamp-2 leading-snug mb-2 drop-shadow-lg">
              {anime.title}
            </h3>

            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {anime.genres.slice(0, 3).map((genre, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-[9px] font-medium bg-black/50 text-white/90 rounded-full"
                  >
                    {genre}
                  </span>
                ))}
                {anime.genres.length > 3 && (
                  <span className="px-2 py-0.5 text-[9px] text-white/60">
                    +{anime.genres.length - 3}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              {anime.episodes ? (
                <div className="flex items-center gap-2 text-xs text-white/80">
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>{anime.episodes} episodes</span>
                </div>
              ) : null}

              {anime.predicted_completion && anime.status !== 'FINISHED' && (
                <div className="flex items-center gap-2 text-xs text-primary font-medium">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Ends {formatDate(anime.predicted_completion)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="header-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
                  <span className="text-primary">Anime</span>
                  <span className="text-foreground">Schedule</span>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium tracking-wide hidden sm:block">
                  {dataUpdatedAt ? `Data updated ${formatRelativeTime(dataUpdatedAt)}` : 'Seasonal Tracker'}
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center">
              <div className="flex surface-subtle rounded-xl p-1">
                <button
                  onClick={() => setTab('browse')}
                  className={`nav-pill flex items-center gap-1.5 ${tab === 'browse' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
                >
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">Browse</span>
                </button>
                <button
                  onClick={() => setTab('schedule')}
                  className={`nav-pill flex items-center gap-1.5 ${tab === 'schedule' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
                >
                  <Calendar className="w-4 h-4" />
                  <span className="hidden sm:inline">Schedule</span>
                </button>
              </div>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {tab === 'schedule' ? (
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            <MonthlySchedule
              initialDate={scheduleDate}
              initialSelectedDate={scheduleSelectedDate}
              onStateChange={handleScheduleStateChange}
              showAdult={showAdult}
            />
          </div>
        </main>
      ) : (
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            {/* Season Header & Filters */}
            <div className="mb-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="animate-fade-in">
                  <p className="text-xs font-medium text-primary mb-1 tracking-widest uppercase">Active Window</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
                    {seasonInfo || 'Anime Catalog'}
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {totalAnime} anime {statusFilter !== 'all' && `• ${statusFilter}`}
                    {searchQuery && ` • “${searchQuery}”`}
                  </p>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    placeholder="Search titles..."
                    className="w-full bg-secondary border border-border rounded-xl pl-9 pr-9 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {searchInput && (
                    <button
                      onClick={() => setSearchInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center animate-fade-in" style={{ animationDelay: '100ms' }}>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Filter className="w-4 h-4" />
                  <span className="font-medium">Filter:</span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                  {[
                    { key: 'all', label: 'All', icon: null },
                    { key: 'releasing', label: 'Airing', icon: PlayCircle },
                    { key: 'finished', label: 'Finished', icon: CheckCircle2 },
                    { key: 'upcoming', label: 'Upcoming', icon: Clock },
                  ].map(({ key, label, icon: Icon }) => (
                    <Button
                      key={key}
                      variant={statusFilter === key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleStatusFilterChange(key as StatusFilter)}
                      className="shrink-0"
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
                      {label}
                    </Button>
                  ))}
                </div>

                {/* Genre Filter Dropdown */}
                <div className="relative" ref={genreDropdownRef}>
                  <Button
                    variant={selectedGenres.length > 0 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowGenreDropdown(!showGenreDropdown)}
                    className="shrink-0"
                  >
                    <Filter className="w-3.5 h-3.5 mr-1.5" />
                    Genres {selectedGenres.length > 0 && `(${selectedGenres.length})`}
                  </Button>

                  {showGenreDropdown && (
                    <div className="absolute top-full mt-2 left-0 z-50 w-72 max-h-80 overflow-y-auto p-3 rounded-xl bg-popover border border-border shadow-card">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">Select Genres</span>
                        {selectedGenres.length > 0 && (
                          <button
                            onClick={() => { setSelectedGenres([]); setCurrentPage(1) }}
                            className="text-xs text-primary hover:underline"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {allGenres.map(genre => (
                          <button
                            key={genre}
                            onClick={() => handleGenreToggle(genre)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              selectedGenres.includes(genre)
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                          >
                            {genre}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer select-none shrink-0 px-2">
                  <input
                    type="checkbox"
                    checked={showAdult}
                    onChange={e => toggleAdult(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  18+
                </label>

                <div className="sm:ml-auto">
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popularity">Popularity</SelectItem>
                      <SelectItem value="end_date">Completion Date</SelectItem>
                      <SelectItem value="score">Rating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Anime Grid */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[2/3]" />
                ))}
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <X className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-1">Something went wrong</h3>
                <p className="text-muted-foreground text-sm mb-4">{loadError}</p>
                <Button variant="outline" size="sm" onClick={loadAnimeData}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Retry
                </Button>
              </div>
            ) : animeList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                  <X className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-1">No anime found</h3>
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? `No titles matching “${searchQuery}”` : 'Try adjusting your filters'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5">
                  {animeList.map((anime, index) => (
                    <AnimeCard key={anime.anime_id} anime={anime} index={index} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-3 mt-8 animate-fade-in">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* Anime Detail Dialog */}
      <Dialog open={detailAnime !== null} onOpenChange={(open) => { if (!open) setDetailAnime(null) }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto p-0">
          {detailAnime && (
            <div>
              <div className="flex flex-col sm:flex-row gap-5 p-6">
                {/* Cover */}
                <div className="shrink-0 mx-auto sm:mx-0">
                  <div className="relative w-40 aspect-[2/3] rounded-lg overflow-hidden border border-border">
                    {detailAnime.cover_image ? (
                      <Image
                        src={detailAnime.cover_image}
                        alt={detailAnime.title}
                        fill
                        sizes="160px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Sparkles className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <DialogTitle className="pr-8">{detailAnime.title}</DialogTitle>
                    {detailAnime.romaji_title && detailAnime.romaji_title !== detailAnime.title && (
                      <p className="text-sm text-muted-foreground mt-0.5">{detailAnime.romaji_title}</p>
                    )}
                  </div>

                  {/* Meta chips */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {detailAnime.status && (
                      <span className={`px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wide ${
                        detailAnime.status === 'FINISHED' ? 'status-finished' :
                        detailAnime.status === 'RELEASING' ? 'status-airing' :
                        'status-upcoming'
                      }`}>
                        {detailAnime.status === 'FINISHED' ? 'Finished' :
                         detailAnime.status === 'RELEASING' ? 'Airing' :
                         'Upcoming'}
                      </span>
                    )}
                    {detailAnime.score ? (
                      <span className="px-2.5 py-1 rounded-lg bg-secondary border border-border flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        {detailAnime.score}%
                      </span>
                    ) : null}
                    {detailAnime.episodes ? (
                      <span className="px-2.5 py-1 rounded-lg bg-secondary border border-border">
                        {detailAnime.episodes} episodes
                      </span>
                    ) : null}
                    {detailAnime.season && detailAnime.season_year ? (
                      <span className="px-2.5 py-1 rounded-lg bg-secondary border border-border capitalize">
                        {detailAnime.season.toLowerCase()} {detailAnime.season_year}
                      </span>
                    ) : null}
                    {detailAnime.is_adult && (
                      <span className="px-2.5 py-1 rounded-lg bg-red-700 text-white font-bold">
                        18+
                      </span>
                    )}
                  </div>

                  {/* Genres */}
                  {detailAnime.genres && detailAnime.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detailAnime.genres.map((genre, i) => (
                        <span key={i} className="px-2 py-0.5 text-[11px] font-medium text-primary bg-primary/10 rounded-full">
                          {genre}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Studios + dates */}
                  <div className="text-sm text-muted-foreground space-y-1">
                    {detailAnime.studios && detailAnime.studios.length > 0 && (
                      <p><span className="text-foreground font-medium">Studio:</span> {detailAnime.studios.join(', ')}</p>
                    )}
                    {detailAnime.start_date && (
                      <p><span className="text-foreground font-medium">Started:</span> {formatDate(detailAnime.start_date)}</p>
                    )}
                    {detailAnime.predicted_completion && detailAnime.status !== 'FINISHED' && (
                      <p><span className="text-foreground font-medium">Ends:</span> {formatDate(detailAnime.predicted_completion)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Synopsis */}
              {detailAnime.synopsis && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-[8]">
                    {stripHtml(detailAnime.synopsis)}
                  </p>
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex justify-end">
                <a
                  href={detailAnime.site_url || `https://anilist.co/anime/${detailAnime.anime_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm">
                    View on AniList
                    <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
