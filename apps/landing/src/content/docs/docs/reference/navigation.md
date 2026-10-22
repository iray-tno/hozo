---
title: "Navigation & Deep Links (@hozo/navigation)"
description: "Router-agnostic navigation, typed route wrappers, deep-link ingress, and Universal Links / App Links verification generators."
sidebar:
  order: 4
---

`@hozo/navigation` connects Hozo's destination-bearing primitives (`Link`, `Button href`, `Pressable href`, `Svg.Link`, and `Canvas.* href`) to your framework's router while keeping real `<a href>` elements on the Web.

```tsx
import { NavigationProvider } from '@hozo/navigation'

export function App({ children }: { children: React.ReactNode }) {
  const router = useYourRouter()
  return (
    <NavigationProvider onNavigate={(href) => router.push(href)}>
      {children}
    </NavigationProvider>
  )
}
```

## Framework router adapters

Dedicated subpaths accept your framework's router structurally without bundling a second copy of the router package:

- **Next.js App Router (`@hozo/navigation/next`):** `NextNavigationProvider`
- **Expo Router (`@hozo/navigation/expo-router`):** `ExpoRouterNavigationProvider`
- **TanStack Router / Start (`@hozo/navigation/tanstack-router`):** `TanStackNavigationProvider`

Relative paths route through the provider; external URLs, `mailto:`, downloads, and modified clicks (Ctrl/Command-click, Shift-click, middle-click) keep their native browser behavior. Pass `shouldHandle` to intercept universal links that point to your own domain.

### `replace` and `prefetch`

- **`replace`:** `<Button href="/signed-in" replace>` maps to `router.replace` on Next.js and Expo Router, and `navigate({ to, replace: true })` on TanStack Router.
- **`prefetch`:** `<Pressable href="/products/42" prefetch>` triggers `onPrefetch` once when the user shows intent — pointer hover or keyboard focus on the Web, and `onPressIn` on React Native.

## Opt-in typed destinations

Applications that want compile-time route checking on `Link`, `Button`, and `Pressable` can create typed primitives from their router's generated route union:

```tsx
// Expo Router
import { createExpoRouterNavigationPrimitives } from '@hozo/navigation/expo-router/typed'
import { type Href, Link as ExpoLink } from 'expo-router'

const Typed = createExpoRouterNavigationPrimitives<Href>(ExpoLink.resolveHref)

<Typed.Link href="/settings">Settings</Typed.Link>
<Typed.Button href={{ pathname: '/posts/[postId]', params: { postId: '42' } }}>
  Open post
</Typed.Button>
```

```tsx
// TanStack Router
import { createTanStackNavigationPrimitives } from '@hozo/navigation/tanstack-router/typed'

const Typed = createTanStackNavigationPrimitives(router)

<Typed.Link href={{ to: '/posts/$postId', params: { postId: '42' } }}>
  Open post
</Typed.Link>
```

External URLs remain explicit with `external`, and dynamic CMS strings can opt out explicitly with `untypedHref(url)` from `@hozo/navigation/typed`.

## Deep-link ingress (`useDeepLink`)

`useDeepLink` normalizes cold-start URLs and runtime arrivals into a single `{ url, path, queryParams, fragment, source }` event. On React Native, it subscribes to incoming link events before reading `Linking.getInitialURL()` so a fast foreground link is never overwritten by a slower cold-start lookup.

## Universal Links & Android App Links (`hozo-links`)

`@hozo/navigation` generates and verifies both sides of domain-to-app association:

1. **Web `.well-known` files (`hozo-links` CLI or `@hozo/navigation/verification/node`):** generates `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from `hozo-links.json`, validating app IDs and canonicalizing SHA-256 certificate fingerprints. Run `pnpm exec hozo-links --check` in CI to catch drift.
2. **Expo config plugin (`@hozo/navigation/expo-config`):** adds `scheme`, iOS `associatedDomains`, and Android HTTPS `intentFilters` with `autoVerify` in `app.json` idempotently.
