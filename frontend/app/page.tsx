'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, Clock, Filter, PlayCircle, CheckCircle2, TrendingUp, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import MonthlySchedule from '@/components/MonthlySchedule'

interface AnimeData {
  anime_id: number
  title: string
  cover_image?: string
  status?: string
  predicted_completion?: string
  confidence?: string
  score?: number
  episodes?: number
  current_episode?: number
  is_bingeable?: boolean
  confidence_reason?: string
  days_until_complete?: number
  next_episode?: {
    number: number
    airs_at?: string
    airs_in_human?: string
  }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  anime?: AnimeData[]
}

interface Anime {
  anime_id: number
  title: string
  status: string
  episodes?: number
  current_episode?: number
  predicted_completion?: string
  confidence?: string
  cover_image?: string
  score?: number
  is_bingeable?: boolean
  confidence_reason?: string
  days_until_complete?: number
  next_episode?: {
    number: number
    airs_at?: string
    airs_in_human?: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const EXAMPLE_QUERIES = [
  "When will Solo Leveling Season 2 finish?",
  "What Fall 2025 anime can I binge by Christmas?",
  "Show me anime finishing this week",
]

type Tab = 'chat' | 'browse' | 'schedule'
type StatusFilter = 'all' | 'bingeable' | 'releasing' | 'finished' | 'upcoming'
type SortOption = 'popularity' | 'completion' | 'score'

export default function Home() {
  const [tab, setTab] = useState<Tab>('browse')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [animeList, setAnimeList] = useState<Anime[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('popularity')
  const [seasonInfo, setSeasonInfo] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check API health
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(data.agent_ready ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

  // Load anime data
  useEffect(() => {
    if (tab === 'browse') {
      loadAnimeData()
    }
  }, [tab])

  const loadAnimeData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/anime/seasonal`)
      const data = await res.json()
      setAnimeList(data.anime || [])
      setSeasonInfo(data.season || '')
    } catch (error) {
      console.error('Failed to load anime:', error)
    } finally {
      setLoading(false)
    }
  }

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendQuery = async (query: string) => {
    if (!query.trim() || loading) return

    const userMessage: Message = { role: 'user', content: query }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || 'No response.',
        anime: data.anime || []
      }])
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect to API.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendQuery(input)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "success" | "warning" => {
    switch (status) {
      case 'FINISHED': return 'success'
      case 'RELEASING': return 'default'
      case 'NOT_YET_RELEASED': return 'warning'
      default: return 'secondary'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'FINISHED': return <CheckCircle2 className="w-3 h-3" />
      case 'RELEASING': return <PlayCircle className="w-3 h-3" />
      case 'NOT_YET_RELEASED': return <Clock className="w-3 h-3" />
      default: return null
    }
  }

  // Filter and sort anime
  const filteredAnime = useMemo(() => {
    let filtered = animeList

    // Apply status filter
    switch (statusFilter) {
      case 'bingeable':
        filtered = filtered.filter(a => a.is_bingeable || a.status === 'FINISHED')
        break
      case 'releasing':
        filtered = filtered.filter(a => a.status === 'RELEASING')
        break
      case 'finished':
        filtered = filtered.filter(a => a.status === 'FINISHED')
        break
      case 'upcoming':
        filtered = filtered.filter(a => a.status === 'NOT_YET_RELEASED')
        break
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'completion':
          if (!a.predicted_completion) return 1
          if (!b.predicted_completion) return -1
          return a.predicted_completion.localeCompare(b.predicted_completion)
        case 'score':
          return (b.score || 0) - (a.score || 0)
        default:
          return 0 // Keep popularity order from API
      }
    })

    return sorted
  }, [animeList, statusFilter, sortBy])

  // Anime Card Component
  const AnimeCard = ({ anime }: { anime: Anime }) => (
    <a
      href={`https://anilist.co/anime/${anime.anime_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full"
    >
      <Card className="h-full overflow-hidden hover:ring-2 hover:ring-primary transition-all group">
        {/* Cover Image */}
        <div className="aspect-[2/3] relative bg-muted overflow-hidden">
          {anime.cover_image ? (
            <img
              src={anime.cover_image}
              alt={anime.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                const parent = e.currentTarget.parentElement
                if (parent) {
                  parent.innerHTML = '<div class="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No Image</div>'
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              No Image
            </div>
          )}

          {/* Top Badges */}
          <div className="absolute top-2 right-2 flex flex-col gap-1">
            {anime.status && (
              <Badge variant={getStatusBadgeVariant(anime.status)} className="flex items-center gap-1">
                {getStatusIcon(anime.status)}
                <span className="text-xs">
                  {anime.status === 'FINISHED' ? 'Done' : anime.status === 'RELEASING' ? 'Airing' : 'Soon'}
                </span>
              </Badge>
            )}
            {anime.is_bingeable && (
              <Badge variant="success" className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs">Bingeable</span>
              </Badge>
            )}
          </div>

          {/* Score Badge */}
          {anime.score && (
            <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold text-white">
              {anime.score}%
            </div>
          )}
        </div>

        {/* Info */}
        <CardContent className="p-3 space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{anime.title}</h3>

          {/* Episode Progress */}
          {anime.episodes && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <PlayCircle className="w-3 h-3" />
              <span>{anime.current_episode || anime.episodes}/{anime.episodes} eps</span>
            </div>
          )}

          {/* Next Episode */}
          {anime.next_episode && anime.status === 'RELEASING' && (
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Clock className="w-3 h-3" />
              <span>Ep {anime.next_episode.number} in {anime.next_episode.airs_in_human}</span>
            </div>
          )}

          {/* Completion Prediction */}
          {anime.predicted_completion && anime.status !== 'FINISHED' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-green-400">
                <Calendar className="w-3 h-3" />
                <span>Done: {formatDate(anime.predicted_completion)}</span>
              </div>
              {anime.confidence && (
                <Badge variant="outline" className="text-xs">
                  {anime.confidence} confidence
                </Badge>
              )}
            </div>
          )}

          {/* Finished Badge */}
          {anime.status === 'FINISHED' && (
            <div className="flex items-center gap-2 text-xs text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready to binge!</span>
            </div>
          )}
        </CardContent>
      </Card>
    </a>
  )


  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm sm:text-xl font-bold truncate">AnimeScheduleAgent</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">AI-Powered Anime Tracker</p>
              </div>
            </div>

            {/* Tabs and Status */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex bg-muted rounded-lg p-0.5 sm:p-1">
                <Button
                  variant={tab === 'browse' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('browse')}
                  className="px-2 sm:px-3 text-xs sm:text-sm"
                >
                  Browse
                </Button>
                <Button
                  variant={tab === 'schedule' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('schedule')}
                  className="px-2 sm:px-3 text-xs sm:text-sm"
                >
                  <Calendar className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                  Schedule
                </Button>
                <Button
                  variant={tab === 'chat' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('chat')}
                  className="px-2 sm:px-3 text-xs sm:text-sm"
                >
                  Chat
                </Button>
              </div>

              {/* Status Indicator - dot only on mobile */}
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  apiStatus === 'online' ? 'bg-green-500' : apiStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                <span className="text-muted-foreground text-xs hidden sm:inline">
                  {apiStatus === 'online' ? 'Connected' : apiStatus === 'offline' ? 'Offline' : 'Connecting...'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {tab === 'schedule' ? (
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            <MonthlySchedule />
          </div>
        </main>
      ) : tab === 'browse' ? (
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
            {/* Filter Bar */}
            <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold truncate">{seasonInfo || 'Loading...'}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {filteredAnime.length} anime {statusFilter !== 'all' && `- ${statusFilter}`}
                  </p>
                </div>

                <Button onClick={loadAnimeData} variant="outline" size="sm" disabled={loading} className="shrink-0">
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
                <div className="flex items-center gap-2 mb-1 sm:mb-0">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filter:</span>
                </div>

                {/* Filter buttons - horizontal scroll on mobile */}
                <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 sm:flex-wrap -mx-3 px-3 sm:mx-0 sm:px-0">
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('all')}
                    className="shrink-0 text-xs sm:text-sm"
                  >
                    All
                  </Button>
                  <Button
                    variant={statusFilter === 'bingeable' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('bingeable')}
                    className="shrink-0 text-xs sm:text-sm"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Bingeable
                  </Button>
                  <Button
                    variant={statusFilter === 'releasing' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('releasing')}
                    className="shrink-0 text-xs sm:text-sm"
                  >
                    <PlayCircle className="w-3 h-3 mr-1" />
                    Airing
                  </Button>
                  <Button
                    variant={statusFilter === 'finished' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('finished')}
                    className="shrink-0 text-xs sm:text-sm"
                  >
                    Finished
                  </Button>
                  <Button
                    variant={statusFilter === 'upcoming' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter('upcoming')}
                    className="shrink-0 text-xs sm:text-sm"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    Upcoming
                  </Button>
                </div>

                <div className="w-full sm:w-auto sm:ml-auto">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="popularity">Popularity</SelectItem>
                      <SelectItem value="completion">Completion Date</SelectItem>
                      <SelectItem value="score">Rating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Anime Grid */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              </div>
            ) : filteredAnime.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <X className="w-16 h-16 mb-4 opacity-50" />
                <p>No anime found with the selected filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4 pb-8">
                {filteredAnime.map((anime) => (
                  <AnimeCard key={anime.anime_id} anime={anime} />
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        /* Chat Tab */
        <>
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-4xl">
              {messages.length === 0 ? (
                <div className="text-center py-8 sm:py-16">
                  <h2 className="text-xl sm:text-2xl font-bold mb-2">Ask me about anime schedules!</h2>
                  <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">I can help you find when anime will finish airing</p>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2">
                    {EXAMPLE_QUERIES.map((query, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => sendQuery(query)}
                        disabled={loading || apiStatus === 'offline'}
                        className="text-xs sm:text-sm whitespace-normal h-auto py-2"
                      >
                        {query}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      }`}>
                        <div className="response-text whitespace-pre-wrap text-sm">{msg.content}</div>
                      </div>

                      {/* Anime cards in chat */}
                      {msg.anime && msg.anime.length > 0 && (
                        <div className="flex gap-3 mt-3 overflow-x-auto max-w-full pb-2">
                          {msg.anime.map((anime) => (
                            <div key={anime.anime_id} className="flex-shrink-0 w-40">
                              <AnimeCard anime={anime as Anime} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-3">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </main>

          {/* Chat Input */}
          <footer className="border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 max-w-4xl">
              <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about anime schedules..."
                  disabled={loading || apiStatus === 'offline'}
                  className="flex-1 bg-background border border-input rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={loading || !input.trim() || apiStatus === 'offline'}
                  className="px-4 sm:px-6"
                >
                  Send
                </Button>
              </form>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
