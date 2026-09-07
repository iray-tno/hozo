import type { ReactNode } from 'react'

import { AppNavigation } from './navigation-provider'

export const metadata = { title: 'Hozo + Next.js' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppNavigation>{children}</AppNavigation>
      </body>
    </html>
  )
}
