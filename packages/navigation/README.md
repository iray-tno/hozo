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
