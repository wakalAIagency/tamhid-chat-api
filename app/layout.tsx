import '../styles/globals.css'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tamhid RAG App',
  description: 'Supabase + OpenAI RAG demo for Tamhid services',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
