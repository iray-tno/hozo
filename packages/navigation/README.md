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

For a no-code build step, add `hozo-links.json` at the project root:

```json
{
  "$schema": "./node_modules/@hozo/navigation/hozo-links.schema.json",
  "outputDirectory": "public",
  "apple": [{ "appIDs": ["ABCDE12345.com.example.app"] }],
  "android": [{
    "packageName": "com.example.app",
    "sha256CertFingerprints": ["01:23:...:EF"]
  }]
}
```

Run `pnpm exec hozo-links` to generate the assets and `pnpm exec hozo-links --check` in CI to fail
when committed assets are missing or stale. Paths in the config are resolved relative to the config
file, so the command behaves the same from a workspace root or an individual app.

### Expo app configuration

The website files prove the domain-to-app direction. Expo also needs the app-to-domain direction.
Add the config plugin next to `expo-router` in `app.json`:

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      ["@hozo/navigation/expo-config", {
        "scheme": "myapp",
        "domains": [{
          "host": "app.example.com",
          "pathPrefixes": ["/products"]
        }]
      }]
    ]
  }
}
```

This adds `scheme`, iOS `associatedDomains`, and Android HTTPS `intentFilters` with `autoVerify`.
It preserves unrelated configuration and can be applied repeatedly without duplicating entries.

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

### Typed destinations (opt in)

Router adapters deliberately leave core `href` values as strings. Applications that want their
router's generated route union on Hozo components can opt into typed wrappers from separate
subpaths. The normal `@hozo/navigation` entry point does not load Hozo components or a router.

Expo Router uses the `Href` generated from the application's own `app` directory. Object
destinations are converted with Expo's public `Link.resolveHref`, so Web still receives a real
anchor URL:

```tsx
import { createExpoRouterNavigationPrimitives } from '@hozo/navigation/expo-router/typed'
import { type Href, Link as ExpoLink } from 'expo-router'

const Typed = createExpoRouterNavigationPrimitives<Href>(ExpoLink.resolveHref)

<Typed.Link href="/settings">Settings</Typed.Link>
<Typed.Button href={{ pathname: '/posts/[postId]', params: { postId: '42' } }}>
  Open post
</Typed.Button>
```

TanStack Router takes the router instance and validates each destination with its generated route
tree. Its object remains a TanStack navigate option until the wrapper asks the router to build the
concrete URL:

```tsx
import { createTanStackNavigationPrimitives } from '@hozo/navigation/tanstack-router/typed'

const Typed = createTanStackNavigationPrimitives(router)

<Typed.Link href={{ to: '/settings' }}>Settings</Typed.Link>
<Typed.Button href={{ to: '/posts/$postId', params: { postId: '42' } }}>
  Open post
</Typed.Button>
```

Arbitrary external URLs remain explicit with `external`. For an internal URL that is intentionally
computed outside the route graph, use the visible escape hatch instead of weakening every route:

```tsx
import { untypedHref } from '@hozo/navigation/typed'

<Typed.Link href="https://example.com/docs" external>Docs</Typed.Link>
<Typed.Pressable href={untypedHref(cmsDestination)}>CMS page</Typed.Pressable>
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
