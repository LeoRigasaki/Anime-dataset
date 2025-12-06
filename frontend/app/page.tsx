'use client'

import { useState, useRef, useEffect } from 'react'

interface AnimeData {
  anime_id: number
  title: string
  cover_image?: string
  status?: string
  predicted_completion?: string
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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const EXAMPLE_QUERIES = [
  "When will Solo Leveling Season 2 finish?",
  "What Fall 2025 anime can I binge by Christmas?",
  "Is Frieren done airing?",
]

type Tab = 'chat' | 'browse'
type Filter = 'bingeable' | 'all'

export default function Home() {
  const [tab, setTab] = useState<Tab>('browse')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [animeList, setAnimeList] = useState<Anime[]>([])
  const [filter, setFilter] = useState<Filter>('bingeable')
  const [seasonInfo, setSeasonInfo] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check API health on mount
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then(res => res.json())
      .then(data => setApiStatus(data.agent_ready ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'))
  }, [])

  // Load anime data when browse tab is active
  useEffect(() => {
    if (tab === 'browse') {
      loadAnimeData()
    }
  }, [tab, filter])

  const loadAnimeData = async () => {
    setLoading(true)
    try {
      const endpoint = filter === 'bingeable' ? '/anime/bingeable' : '/anime/seasonal'
      const res = await fetch(`${API_URL}${endpoint}`)
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
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Failed to connect to API.' }])
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FINISHED': return 'bg-green-500'
      case 'RELEASING': return 'bg-blue-500'
      case 'NOT_YET_RELEASED': return 'bg-yellow-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎌</span>
            <h1 className="text-xl font-semibold">AnimeScheduleAgent</h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Tabs */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setTab('browse')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  tab === 'browse' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Browse
              </button>
              <button
                onClick={() => setTab('chat')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                  tab === 'chat' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                Chat
              </button>
            </div>
            {/* Status */}
            <div className="flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${
                apiStatus === 'online' ? 'bg-green-500' : apiStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              <span className="text-gray-400">
                {apiStatus === 'online' ? 'Connected' : apiStatus === 'offline' ? 'Offline' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {tab === 'browse' ? (
        <main className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {/* Filter bar */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold">{seasonInfo || 'Loading...'}</h2>
                <p className="text-gray-400 text-sm mt-1">
                  {filter === 'bingeable' ? 'Anime you can binge (finished or finishing soon)' : 'All anime this season'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('bingeable')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === 'bingeable' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  ✅ Bingeable
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  📺 All Anime
                </button>
              </div>
            </div>

            {/* Anime Grid */}
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {animeList.map((anime) => (
                  <a
                    href={`https://anilist.co/anime/${anime.anime_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={anime.anime_id}
                    className="bg-gray-900 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition group block"
                  >
                    {/* Cover Image */}
                    <div className="aspect-[2/3] relative bg-gray-800">
                      {anime.cover_image ? (
                        <img
                          src={anime.cover_image}
                          alt={anime.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-600">
                          No Image
                        </div>
                      )}
                      {/* Status badge */}
                      <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(anime.status)}`}>
                        {anime.status === 'FINISHED' ? '✓ Done' : anime.status === 'RELEASING' ? 'Airing' : 'Soon'}
                      </div>
                      {/* Score */}
                      {anime.score && (
                        <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs">
                          ⭐ {anime.score}%
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-sm line-clamp-2 mb-2">{anime.title}</h3>
                      <div className="text-xs text-gray-400 space-y-1">
                        {anime.episodes && (
                          <p>{anime.current_episode || anime.episodes}/{anime.episodes} eps</p>
                        )}
                        {anime.predicted_completion && anime.status !== 'FINISHED' && (
                          <p className="text-green-400">
                            Done: {formatDate(anime.predicted_completion)}
                            {anime.confidence && ` (${anime.confidence})`}
                          </p>
                        )}
                        {anime.status === 'FINISHED' && (
                          <p className="text-green-400">✅ Ready to binge!</p>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {!loading && animeList.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No anime found. Try refreshing or check if the backend is running.
              </div>
            )}
          </div>
        </main>
      ) : (
        /* Chat Tab */
        <>
          <main className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-6">Ask me when anime will finish airing!</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLE_QUERIES.map((query, i) => (
                      <button
                        key={i}
                        onClick={() => sendQuery(query)}
                        className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition"
                      >
                        {query}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
                    }`}>
                      <div className="response-text whitespace-pre-wrap">{msg.content}</div>
                    </div>
                    {/* Anime cards */}
                    {msg.anime && msg.anime.length > 0 && (
                      <div className="flex gap-3 mt-3 overflow-x-auto max-w-full pb-2">
                        {msg.anime.slice(0, 5).map((anime) => (
                          <a
                            key={anime.anime_id}
                            href={`https://anilist.co/anime/${anime.anime_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 w-32 bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition"
                          >
                            <div className="aspect-[2/3] bg-gray-700">
                              {anime.cover_image && (
                                <img src={anime.cover_image} alt={anime.title} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium line-clamp-2">{anime.title}</p>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </main>

          <footer className="border-t border-gray-800 p-4">
            <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex gap-3">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask about anime schedules..."
                disabled={loading || apiStatus === 'offline'}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || apiStatus === 'offline'}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-medium transition"
              >
                Send
              </button>
            </form>
          </footer>
        </>
      )}
    </div>
  )
}