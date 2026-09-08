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

The framework adapters map `replace` to Next.js or Expo Router's `replace`, and to TanStack Router's
`navigate({ to, replace: true })`. Without a provider, `replace` is inert and the platform's normal
link fallback still works.

Use `prefetch` for destinations worth warming once the user shows intent. Hozo keeps the trigger
platform-appropriate: pointer hover or keyboard focus on Web, and press-in on React Native. It is
best-effort, runs once per current destination, and never prefetches disabled, external, download,
or new-context links:

```tsx
<Pressable href="/products/42" prefetch>
  Product card
</Pressable>
```

`NavigationProvider` accepts an optional `onPrefetch`. The framework providers connect it to
Next.js `router.prefetch`, Expo Router `router.prefetch` when available, and TanStack Router
`router.preloadRoute`. Routers without a prefetch method remain valid adapters.

## Deep-link ingress

`useDeepLink` presents cold starts and later URL arrivals with one event shape. On React Native it
subscribes before reading `Linking.getInitialURL()`, so a foreground link cannot be overwritten by
a slower cold-start lookup. On Web it reports the initial address and later back/forward or hash
arrivals without taking over routing:

```tsx
import { useDeepLink } from '@hozo/navigation'

function DeepLinkGate() {
  useDeepLink(({ url, path, queryParams, fragment, source }) => {
    // Validate authentication, attribution, or other ingress policy here.
    console.log({ url, path, queryParams, fragment, source })
  })
  return null
}
```

Custom schemes are normalized as application paths: `myapp://products/42?ref=mail` becomes
`path: '/products/42'` with `queryParams.ref === 'mail'`. Repeated query keys remain arrays rather
than being discarded. Pass `{ initial: false }` when only later arrivals matter.

### Domain verification files

The same package creates the two JSON documents that prove a Web domain belongs to the native app:

```ts
import {
  createAndroidAssetLinks,
  createAppleAppSiteAssociation,
  serializeDeepLinkVerification,
} from '@hozo/navigation'

const apple = createAppleAppSiteAssociation([{
  appIDs: ['ABCDE12345.com.example.app'],
  components: [{ path: '/products/*' }],
}])

const android = createAndroidAssetLinks([{
  packageName: 'com.example.app',
  sha256CertFingerprints: [process.env.ANDROID_SHA256!],
}])
```

Serve the serialized values as `application/json` over HTTPS, without redirects, at
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` respectively. Publish
one file on every associated host. The generator validates identifiers and canonicalizes Android
certificate fingerprints; it does not guess signing identities from the local machine.

Build scripts can place both documents into any framework's public directory without hard-coding
either filename:

```ts
import { writeDeepLinkVerificationFiles } from '@hozo/navigation/verification/node'

writeDeepLinkVerificationFiles({
  outputDirectory: new URL('./public', import.meta.url).pathname,
  apple,
  android,
})
```

Existing identical files are left untouched, keeping watch builds stable. This Node-only writer is
an explicit subpath so React Native bundles never resolve `node:fs`.

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
