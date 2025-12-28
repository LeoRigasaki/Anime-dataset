import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AnimeSchedule - AI-Powered Anime Tracker',
  description: 'Track anime schedules, get AI-powered recommendations, and discover new shows with our premium anime tracker.',
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
