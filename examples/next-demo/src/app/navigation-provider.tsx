'use client'

import { NextNavigationProvider } from '@hozo/navigation/next'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export function AppNavigation({ children }: { children: ReactNode }) {
  const router = useRouter()
  return <NextNavigationProvider router={router}>{children}</NextNavigationProvider>
}
