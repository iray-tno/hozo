# RFC 003: Universal Navigation, Links, Pressables & Router Adapters

- **Status**: Draft
- **Tracking Issue**: #185
- **Target Packages**: `@hozo/core`, `@hozo/navigation`, `@hozo/canvas`

---

## 1. Summary & Motivation

With foundational `<Link>` and `<Button href="...">` primitives available in `@hozo/core`, cross-platform navigation faces deep architectural trade-offs across platforms (DOM vs React Native) and across rendering surfaces (HTML/Views vs Canvas/SVG):
- **Inline vs Block Navigation**: Web `<a>` can wrap inline spans or large block cards; React Native requires inline text links inside `<Text>`, but block-level interactive cards inside `<Pressable>`.
- **Button Links vs Content Links**: `<Button href>` keeps Button presentation while exposing link semantics, because its function is navigation (`Enter`) rather than an action (`Space` + `Enter`).
- **Client-Side Routing vs External Links**: Seamlessly supporting in-app routing (Next.js `next/link`, Expo Router `expo-router`, TanStack Router) without coupling core primitives to a specific framework.
- **Canvas & SVG Hit-Testing**: Declarative 2D Canvas scenes and SVG shapes navigating to URLs while exposing accessible links to search engines and screen readers.

---

## 2. Architectural Design & Primitive Roles

```text
┌───────────────────────────────────────────────────────────────┐
│ Application Source                                            │
│   <Link href="/about">            (Inline text link)           │
│   <Button href="/checkout">       (Prominent navigation)      │
│   <Pressable href="/items/42">    (Block / card link)         │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ @hozo/navigation (Routing Bridge)                              │
│   NavigationAdapterProvider (Next.js / Expo Router / TanStack) │
│   LinkInterceptor (in-app client push vs external Linking)    │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│ Target Lowering                                               │
│   Web:    semantic <a>, optionally intercepted by a router    │
│   Native: link-role Pressable, optionally routed in-app       │
│   Canvas: hit-test dispatch + off-screen accessible anchor    │
└───────────────────────────────────────────────────────────────┘
```

### 1. Separation of Responsibilities

| Primitive | Intended Use Case | Web Lowering | Native Lowering | Keyboard Activation |
|---|---|---|---|---|
| **`<Link>`** | Inline editorial text navigation | `<a>` | `<HozoLink>` / link-role `Pressable` | `Enter` |
| **`<Button href>`** | Visually button-like navigation | `<a>` | `<Pressable accessibilityRole="link">` | `Enter` |
| **`<Pressable href>`** | Interactive block, card, or list row | `<a className="hozo-pressable">` | `<Pressable accessibilityRole="link">` | `Enter` |

---

## 3. Router Integration Pattern (`@hozo/navigation`)

To keep `@hozo/core` zero-dependency, routing frameworks hook into Hozo via a pluggable adapter:

```tsx
// App entry point
import { NavigationProvider } from '@hozo/navigation'
import { useRouter } from 'next/navigation' // or expo-router

export function RootLayout({ children }) {
  const router = useRouter()

  return (
    <NavigationProvider
      onNavigate={(href, { replace }) => {
        if (replace) router.replace(href)
        else router.push(href)
      }}
    >
      {children}
    </NavigationProvider>
  )
}
```

When an in-app `href` is clicked:
1. `NavigationProvider` intercepts relative links (`/profile`).
2. Invokes the registered client-side router transition without full page reload.
3. External links (`https://...`) fall back directly to native browser navigation on Web or `Linking.openURL` on Native.

`prefetch` is an explicit, best-effort hint rather than an eager render-time side effect. Web
signals intent on pointer hover or keyboard focus; Native signals it on press-in. The navigation
adapter applies the same application-route boundary as navigation and maps the hint to the
framework's prefetch/preload operation. Disabled links and destinations owned by the platform
(external, download, or a new browsing context) are not warmed.

Deep-link ingress is deliberately adjacent to, rather than part of, route matching. `useDeepLink`
normalizes the initial URL and later platform URL events into `{ url, path, queryParams, fragment,
source }`; the application remains responsible for authentication and choosing a route. On Native
the listener is installed before the asynchronous initial-URL read so a newer foreground arrival
cannot be followed by stale cold-start handling. On Web the same hook observes the initial address,
history traversal, and hash changes without patching `history.pushState` or duplicating router work.

---

## 4. Non-DOM Surfaces: `@hozo/canvas` & `<Svg>`

### 2D Canvas Scene Graph
When a scene element in `@hozo/canvas` specifies `href`:
- **Interaction**: The hit-testing engine triggers `onNavigate` upon pointer release within the shape bounds.
- **Accessibility & SEO**: Canvas maintains an off-screen, visually hidden semantic fallback tree containing real DOM `<a>` elements on Web and accessibility elements on Native, ensuring screen readers and crawlers discover all links.

### SVG Primitives
Universal SVG shapes with `href` lower to `<a xlink:href="...">` on Web and tap responders on Native.

---

## 5. Security & Accessibility Invariants

- **`rel="noreferrer noopener"`**: Automatically injected when `external={true}` or `target="_blank"` is present.
- **Keyboard Modalities**:
  - Every destination-bearing primitive retains link semantics and responds to `Enter`.
  - Action buttons without `href` respond to both `Space` and `Enter`.

---

## 6. Verification Matrix

| Target Platform | Semantic Output | Expected AT Behavior | Verified |
|---|---|---|---|
| Web / Chrome + NVDA | `<a>` vs `<button>` | Reads "link" vs "button", uses Enter vs Enter/Space | ⬜ |
| Web / Safari + VoiceOver | `<a>` vs `<button>` | Listed in Links rotor vs Buttons rotor | ⬜ |
| iOS + VoiceOver | `<Text>` / `<Pressable>` link role | Announces role="link", double-tap navigates | ⬜ |
| Android + TalkBack | `<Text>` / `<Pressable>` link role | Announces role="link", double-tap navigates | ⬜ |
