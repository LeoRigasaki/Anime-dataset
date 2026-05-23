import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AnimeSchedule - Seasonal Anime Tracker',
  description: 'Track anime schedules and browse the latest seasonal catalog from the active dataset window.',
  keywords: ['anime', 'schedule', 'tracker', 'anilist', 'episodes', 'recommendations'],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08080c',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  )
}
