# `@hozo/navigation`

Router-agnostic navigation for Hozo's semantic links and destination-bearing controls.

```tsx
import { NavigationProvider } from '@hozo/navigation'

export function App({ children }) {
  const router = useYourRouter()
  return <NavigationProvider onNavigate={(href) => router.push(href)}>{children}</NavigationProvider>
}
```

Relative references are application routes by default. Absolute URLs, protocol-relative URLs,
`mailto:`, custom schemes, modified clicks, downloads, and named browsing targets retain their
platform behavior. Use `shouldHandle` when the router also owns an absolute universal link:

```tsx
<NavigationProvider
  shouldHandle={(href) => href.startsWith('/') || href.startsWith('https://app.example.com/')}
  onNavigate={(href) => router.push(href)}
>
  {children}
</NavigationProvider>
```

On Web, links remain real `<a href>` elements, so SEO, copying destinations, right-click menus,
and new-tab gestures continue to work. On React Native, the same provider connects `Link`,
`Button href`, and other destination-bearing primitives to the installed router.

Use `replace` for redirect-like navigation that should not leave the current screen in router
history:

```tsx
<Button href="/signed-in" replace>
  Continue
</Button>
```

The framework adapters map this to Next.js or Expo Router's `replace`, and to TanStack Router's
`navigate({ to, replace: true })`. Without a provider, `replace` is inert and the platform's normal
link fallback still works.

## Framework adapters

The adapter entry points accept router instances structurally, so Hozo does not install or bundle
a second copy of the framework router.

```tsx
// Next.js App Router
'use client'

import { NextNavigationProvider } from '@hozo/navigation/next'
import { useRouter } from 'next/navigation'

export function AppNavigation({ children }) {
  const router = useRouter()
  return <NextNavigationProvider router={router}>{children}</NextNavigationProvider>
}
```

```tsx
// Expo Router
import { ExpoRouterNavigationProvider } from '@hozo/navigation/expo-router'
import { useRouter } from 'expo-router'

export function AppNavigation({ children }) {
  const router = useRouter()
  return <ExpoRouterNavigationProvider router={router}>{children}</ExpoRouterNavigationProvider>
}
```

```tsx
// TanStack Router / TanStack Start
import { TanStackNavigationProvider } from '@hozo/navigation/tanstack-router'
import { useRouter } from '@tanstack/react-router'

export function AppNavigation({ children }) {
  const router = useRouter()
  return <TanStackNavigationProvider router={router}>{children}</TanStackNavigationProvider>
}
```
