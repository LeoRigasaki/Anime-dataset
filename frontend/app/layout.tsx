import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AnimeScheduleAgent',
  description: 'AI-powered anime completion predictions',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
