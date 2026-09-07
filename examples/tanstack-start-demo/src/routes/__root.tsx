import { TanStackNavigationProvider } from '@hozo/navigation/tanstack-router'
import { createRootRoute, HeadContent, Scripts, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Hozo + TanStack Start' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const router = useRouter()
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TanStackNavigationProvider router={router}>{children}</TanStackNavigationProvider>
        <Scripts />
      </body>
    </html>
  )
}
