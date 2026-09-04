import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Oncechat — Anonymous 1-to-1 Chat',
  description: 'Create or join a private room and chat anonymously in real time.',
  icons: {
    icon: '/oncechat-icon.png',
    apple: '/oncechat-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',          // handles iPhone notch / safe-area
  interactiveWidget: 'resizes-content', // keyboard shrinks layout, not zooms
  themeColor: '#0f0f0f',
}


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="h-full flex flex-col antialiased">{children}</body>
    </html>
  )
}
