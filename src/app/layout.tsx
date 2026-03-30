import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'LD Kuna Osekovo',
  description: 'Aplikacija za upravljanje lovištem',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
