'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react'

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

interface WeeklySchedule {
  week_start: string
  week_end: string
  week_label: string
  total_schedules: number
  schedule: Record<string, ScheduleItem[]>
  days_with_anime: string[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DAYS_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

export default function WeeklySchedule() {
  const [schedule, setSchedule] = useState<WeeklySchedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    loadSchedule()
  }, [weekOffset])

  const loadSchedule = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/anime/schedule/weekly?weeks_offset=${weekOffset}`)
      const data = await res.json()
      setSchedule(data)
    } catch (error) {
      console.error('Failed to load schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aired': return <Badge variant="secondary">Aired</Badge>
      case 'airing_soon': return <Badge variant="success" className="animate-pulse">Airing Soon!</Badge>
      case 'airing_today': return <Badge variant="default">Today</Badge>
      default: return <Badge variant="outline">Upcoming</Badge>
    }
  }

  if (loading && !schedule) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Calendar className="w-8 h-8" />
            Weekly Airing Schedule
          </h2>
          {schedule && (
            <p className="text-muted-foreground mt-1">
              {schedule.week_label} • {schedule.total_schedules} episodes
            </p>
          )}
        </div>

        {/* Week Navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(weekOffset - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(weekOffset + 1)}
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Weekly Grid */}
      {schedule && (
        <div className="space-y-6">
          {DAYS_ORDER.filter(day => schedule.schedule[day]?.length > 0).map(day => (
            <div key={day} className="space-y-3">
              {/* Day Header */}
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-2 border-b border-border z-10">
                <h3 className="text-xl font-bold text-primary">{day}</h3>
                <p className="text-sm text-muted-foreground">
                  {schedule.schedule[day].length} episodes
                </p>
              </div>

              {/* Episodes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {schedule.schedule[day].map((item) => (
                  <a
                    key={item.schedule_id}
                    href={`https://anilist.co/anime/${item.anime_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Card className="overflow-hidden hover:ring-2 hover:ring-primary transition-all group h-full">
                      {/* Cover Image */}
                      <div className="aspect-[16/9] relative bg-muted overflow-hidden">
                        {item.cover_image ? (
                          <img
                            src={item.cover_image}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            No Image
                          </div>
                        )}

                        {/* Airing Status Badge */}
                        <div className="absolute top-2 right-2">
                          {getStatusBadge(item.airing_status)}
                        </div>

                        {/* Score */}
                        {item.score && (
                          <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded text-xs font-semibold text-white">
                            {item.score}%
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <CardContent className="p-3 space-y-2">
                        <h4 className="font-semibold text-sm line-clamp-2 leading-tight">
                          {item.title}
                        </h4>

                        {/* Episode & Time */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">Ep {item.episode}</span>
                            {item.total_episodes && (
                              <span>of {item.total_episodes}</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <Clock className="w-3 h-3" />
                            <span className="font-medium text-primary">
                              {item.airing_time}
                            </span>
                            <span className="text-muted-foreground">
                              ({item.airs_in_human})
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
