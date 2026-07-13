import Image from 'next/image'
import { Clock, Sparkles, Star, Trophy } from 'lucide-react'
import { ScheduleItem, isFinale, isPremiere } from '@/lib/schedule'

interface ScheduleEntryCardProps {
  item: ScheduleItem
  formatTime: (timestamp: number) => string
}

export default function ScheduleEntryCard({ item, formatTime }: ScheduleEntryCardProps) {
  const premiere = isPremiere(item)
  const finale = isFinale(item)

  return (
    <a
      href={`https://anilist.co/anime/${item.anime_id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <div className={`
        surface-subtle rounded-xl overflow-hidden transition-all duration-200 h-full
        ${premiere
          ? 'ring-1 ring-primary/60 bg-primary/5'
          : finale
            ? 'ring-1 ring-amber-500/50 bg-amber-500/5'
            : 'hover:bg-accent'
        }
      `}>
        <div className="flex gap-3 p-3 h-full">
          {item.cover_image && (
            <div className="relative shrink-0 self-start">
              <Image
                src={item.cover_image}
                alt={item.title}
                width={56}
                height={80}
                className="w-14 h-20 object-cover rounded-lg shadow-lg"
              />
              {finale && (
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
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {premiere && (
                <span className="premiere-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] tracking-wide">
                  <Sparkles className="w-2.5 h-2.5" />
                  PREMIERE
                </span>
              )}
              {finale && !item.cover_image && (
                <span className="finale-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] tracking-wide">
                  <Trophy className="w-2.5 h-2.5" />
                  END
                </span>
              )}
            </div>
            <h4 className={`
              font-medium text-sm line-clamp-2 leading-snug mb-1.5 transition-colors
              ${premiere
                ? 'text-primary'
                : finale
                  ? 'text-amber-400'
                  : 'text-foreground group-hover:text-primary'
              }
            `}>
              {item.title}
            </h4>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`font-semibold ${premiere ? 'text-primary' : finale ? 'text-amber-400' : ''}`}>
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
                {formatTime(item.airing_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </a>
  )
}
