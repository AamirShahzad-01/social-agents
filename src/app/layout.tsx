import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { ThemeProvider } from '@/components/theme-provider'
import { ServiceWorkerRegistration } from '@/components/PWAInstall'
import { Inter, Manrope } from 'next/font/google'
import TopLoadingBar from '@/components/layout/TopLoadingBar'
import { Suspense } from 'react'
import { CanvaAutoRefreshProvider } from '@/hooks/useCanvaAutoRefresh'
import { YouTubeAutoRefreshProvider } from '@/hooks/useYouTubeAutoRefresh'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Multi Agents System for Social Media Marketing',
  description: 'Professional Multi Agents System for Social Media Marketing and Content generation and management',
  manifest: '/manifest.json',
  icons: {
    icon: '/zaik_light.png',
    apple: '/zaik_light.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Zaik',
  },
  applicationName: 'Zaik',
}

export const viewport: Viewport = {
  themeColor: '#a8dce4ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${manrope.variable} antialiased`} suppressHydrationWarning>
        <ServiceWorkerRegistration />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <CanvaAutoRefreshProvider>
              <YouTubeAutoRefreshProvider>
                <NotificationProvider>
                  <Suspense fallback={null}>
                    <TopLoadingBar />
                  </Suspense>
                  {children}
                </NotificationProvider>
              </YouTubeAutoRefreshProvider>
            </CanvaAutoRefreshProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
