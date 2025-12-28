'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, Clock, Filter, PlayCircle, CheckCircle2, X, Sparkles, MessageSquare, Search, Send, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
  score?: number
  episodes?: number
  current_episode?: number
  genres?: string[]
  days_until_complete?: number
  is_adult?: boolean
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
  cover_image?: string
  score?: number
  genres?: string[]
  days_until_complete?: number
  is_adult?: boolean
  next_episode?: {
    number: number
    airs_at?: string
    airs_in_human?: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Enhanced markdown parser for chat responses
const parseMarkdown = (text: string): React.ReactNode[] => {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, lineIndex) => {
    const parseInline = (str: string): React.ReactNode[] => {
      const parts: React.ReactNode[] = []
      let remaining = str
      let keyIndex = 0

      while (remaining.length > 0) {
        const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
        if (boldMatch && boldMatch.index !== undefined) {
          if (boldMatch.index > 0) {
            parts.push(remaining.slice(0, boldMatch.index))
          }
          parts.push(<strong key={`b-${keyIndex++}`} className="font-semibold text-primary">{boldMatch[1]}</strong>)
          remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
          continue
        }

        const italicMatch = remaining.match(/\*(.+?)\*/)
        if (italicMatch && italicMatch.index !== undefined) {
          if (italicMatch.index > 0) {
            parts.push(remaining.slice(0, italicMatch.index))
          }
          parts.push(<em key={`i-${keyIndex++}`} className="italic text-muted-foreground">{italicMatch[1]}</em>)
          remaining = remaining.slice(italicMatch.index + italicMatch[0].length)
          continue
        }

        parts.push(remaining)
        break
      }

      return parts
    }

    if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <div key={lineIndex} className="flex items-start gap-3 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
          <span>{parseInline(line.slice(2))}</span>
        </div>
      )
    } else if (line.match(/^\d+\. /)) {
      const match = line.match(/^(\d+)\. (.*)/)
      if (match) {
        elements.push(
          <div key={lineIndex} className="flex items-start gap-3 ml-1">
            <span className="text-primary font-medium min-w-[1.5em]">{match[1]}.</span>
            <span>{parseInline(match[2])}</span>
          </div>
        )
      }
    } else if (line.trim() === '') {
      elements.push(<div key={lineIndex} className="h-3" />)
    } else {
      elements.push(<div key={lineIndex}>{parseInline(line)}</div>)
    }
  })

  return elements
}

const EXAMPLE_QUERIES = [
  "Which anime are ending this week?",
  "Recommend anime similar to Solo Leveling",
  "What action anime are airing this season?",
  "What episodes air tomorrow?",
]

type Tab = 'chat' | 'browse' | 'schedule'
type StatusFilter = 'all' | 'releasing' | 'finished' | 'upcoming'
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

  // State persistence for schedule tab
  const [scheduleDate, setScheduleDate] = useState<Date>(new Date())
  const [scheduleSelectedDate, setScheduleSelectedDate] = useState<string | null>(null)

  const handleScheduleStateChange = (date: Date, selectedDate: string | null) => {
    setScheduleDate(date)
    setScheduleSelectedDate(selectedDate)
  }

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(data.agent_ready ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

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

  const filteredAnime = useMemo(() => {
    let filtered = animeList

    switch (statusFilter) {
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

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'completion':
          if (!a.predicted_completion) return 1
          if (!b.predicted_completion) return -1
          return a.predicted_completion.localeCompare(b.predicted_completion)
        case 'score':
          return (b.score || 0) - (a.score || 0)
        default:
          return 0
      }
    })

    return sorted
  }, [animeList, statusFilter, sortBy])

  /* Premium Anime Card Component */
  const AnimeCard = ({ anime, index = 0 }: { anime: Anime; index?: number }) => (
    <a
      href={`https://anilist.co/anime/${anime.anime_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="anime-card h-full group">
        {/* Cover Image Container */}
        <div className="anime-card-image aspect-[2/3] relative">
          {anime.cover_image ? (
            <img
              src={anime.cover_image}
              alt={anime.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/50">
              <Sparkles className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}

          {/* Score Badge - Top Left */}
          {anime.score && (
            <div className="absolute top-3 left-3 score-badge flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-white">{anime.score}%</span>
            </div>
          )}

          {/* Status Badge - Top Right */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
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
              <div className="px-2 py-1 rounded-lg bg-red-500/90 text-white text-[10px] font-bold">
                18+
              </div>
            )}
          </div>

          {/* Content Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="font-display font-semibold text-sm text-white line-clamp-2 leading-snug mb-2 drop-shadow-lg">
              {anime.title}
            </h3>

            {/* Genres */}
            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {anime.genres.slice(0, 3).map((genre, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-[9px] font-medium bg-white/10 backdrop-blur-sm text-white/90 rounded-full"
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

            {/* Episode & Completion Info */}
            <div className="space-y-1.5">
              {anime.episodes && (
                <div className="flex items-center gap-2 text-xs text-white/80">
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>{anime.current_episode || anime.episodes}/{anime.episodes} episodes</span>
                </div>
              )}

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
    </a>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* Premium Header */}
      <header className="header-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-primary" />
                </div>
                <div className="absolute -inset-1 bg-primary/20 rounded-xl blur-lg -z-10" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight truncate">
                  <span className="text-gradient">Anime</span>
                  <span className="text-foreground">Schedule</span>
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-medium tracking-wide hidden sm:block">
                  AI-Powered Tracker
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 sm:gap-2">
              <div className="flex glass-subtle rounded-xl p-1">
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
                <button
                  onClick={() => setTab('chat')}
                  className={`nav-pill flex items-center gap-1.5 ${tab === 'chat' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2 px-3 py-2 glass-subtle rounded-xl">
                <span className={`w-2 h-2 rounded-full ${
                  apiStatus === 'online' ? 'status-online' :
                  apiStatus === 'offline' ? 'bg-red-500' :
                  'bg-amber-500 animate-pulse'
                }`} />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {apiStatus === 'online' ? 'Online' : apiStatus === 'offline' ? 'Offline' : '...'}
                </span>
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
            />
          </div>
        </main>
      ) : tab === 'browse' ? (
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6">
            {/* Season Header & Filters */}
            <div className="mb-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="animate-fade-in">
                  <p className="text-xs font-medium text-primary mb-1 tracking-widest uppercase">Current Season</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
                    {seasonInfo || 'Loading...'}
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {filteredAnime.length} anime {statusFilter !== 'all' && `• ${statusFilter}`}
                  </p>
                </div>

                <Button
                  onClick={loadAnimeData}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  className="glass-subtle border-white/5 hover:bg-white/5 self-start sm:self-auto"
                >
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
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
                      onClick={() => setStatusFilter(key as StatusFilter)}
                      className={`shrink-0 ${
                        statusFilter === key
                          ? 'btn-glow'
                          : 'glass-subtle border-white/5 hover:bg-white/5'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 mr-1.5" />}
                      {label}
                    </Button>
                  ))}
                </div>

                <div className="sm:ml-auto">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="w-full sm:w-[180px] glass-subtle border-white/5">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent className="glass border-white/5">
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
              <div className="flex flex-col items-center justify-center py-20">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
                </div>
                <p className="text-muted-foreground mt-4 text-sm">Loading anime...</p>
              </div>
            ) : filteredAnime.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                  <X className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-1">No anime found</h3>
                <p className="text-muted-foreground text-sm">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5">
                {filteredAnime.map((anime, index) => (
                  <AnimeCard key={anime.anime_id} anime={anime} index={index} />
                ))}
              </div>
            )}
          </div>
        </main>
      ) : (
        /* Chat Tab */
        <>
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6 max-w-3xl">
              {messages.length === 0 ? (
                <div className="text-center py-16 animate-fade-in">
                  <div className="relative inline-block mb-6">
                    <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-10 h-10 text-primary" />
                    </div>
                    <div className="absolute -inset-4 bg-primary/10 rounded-3xl blur-2xl -z-10" />
                  </div>

                  <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3">
                    Ask me about <span className="text-gradient">anime</span>
                  </h2>
                  <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                    I can help with schedules, recommendations, episode info, and more
                  </p>

                  <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
                    {EXAMPLE_QUERIES.map((query, i) => (
                      <button
                        key={i}
                        onClick={() => sendQuery(query)}
                        disabled={loading || apiStatus === 'offline'}
                        className="glass-subtle px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200 disabled:opacity-50"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}
                    >
                      <div className={`max-w-[85%] px-4 py-3 ${
                        msg.role === 'user'
                          ? 'chat-bubble-user'
                          : 'chat-bubble-assistant'
                      }`}>
                        <div className="text-sm space-y-1.5 leading-relaxed">
                          {msg.role === 'user' ? msg.content : parseMarkdown(msg.content)}
                        </div>
                      </div>

                      {/* Anime cards in chat */}
                      {msg.anime && msg.anime.length > 0 && (
                        <div className="flex gap-3 mt-3 overflow-x-auto max-w-full pb-2 hide-scrollbar">
                          {msg.anime
                            .filter((anime) => anime.cover_image)
                            .slice(0, 8)
                            .map((anime, index) => (
                              <div key={anime.anime_id} className="flex-shrink-0 w-36">
                                <AnimeCard anime={anime as Anime} index={index} />
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {loading && (
                    <div className="flex justify-start animate-fade-in">
                      <div className="chat-bubble-assistant px-5 py-4">
                        <div className="flex gap-1.5">
                          <span className="loading-dot" />
                          <span className="loading-dot" />
                          <span className="loading-dot" />
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
          <footer className="border-t border-white/5 bg-background/80 backdrop-blur-xl">
            <div className="container mx-auto px-4 py-4 max-w-3xl">
              <form onSubmit={handleSubmit} className="chat-input flex gap-3 p-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about anime schedules, recommendations..."
                  disabled={loading || apiStatus === 'offline'}
                  className="flex-1 bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={loading || !input.trim() || apiStatus === 'offline'}
                  className="btn-glow px-6"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}
