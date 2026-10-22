---
title: "WebView (@hozo/webview)"
description: "Embedded web content with a required accessible title, source-checked message bridge, and graceful Native fallback."
sidebar:
  order: 5
---

`@hozo/webview` embeds external or sandboxed web content inside a Hozo application: an `<iframe>` on the Web and `react-native-webview` on React Native.

```sh
pnpm add @hozo/webview
# On React Native when embedding in-app web views:
npx expo install react-native-webview
```

```tsx
import { WebView } from '@hozo/webview'

export function CheckoutFrame({ onPaid }: { onPaid: () => void }) {
  return (
    <WebView
      src="https://example.com/checkout"
      title="Payment form"
      onMessage={({ origin, data }) => {
        if (origin === 'https://example.com' && data?.paid === true) {
          onPaid()
        }
      }}
      className="h-96 w-full"
    />
  )
}
```

## Contract and guarantees

- **Named frame (`title` is required):** WCAG 4.1.2 requires every frame to have an accessible name so a screen reader user hears what the frame is ("Payment form") before deciding whether to enter it. On the Web, `title` sets the `<iframe>` title attribute; on React Native, it sets `accessibilityLabel`.
- **Source-verified `onMessage` bridge:** on the Web, `onMessage` only accepts `MessageEvent`s whose `event.source === iframe.contentWindow`, preventing other frames or browser tabs from spoofing messages into the handler. Your application still checks `message.origin` for the origin it trusts. On React Native, the embedded page calls `window.ReactNativeWebView.postMessage(JSON.stringify(…))` and Hozo parses JSON payloads so one handler works on both platforms.
- **Lazy by default on Web:** sets `loading="lazy"` unless overridden, and forwards `sandbox`, `allow`, and `referrerPolicy` to the `<iframe>`.
- **Graceful fallback when `react-native-webview` is absent:** `@hozo/webview` ships no native code of its own. On React Native, it resolves `react-native-webview` if installed in the application. If not installed, rather than crashing the bundle or rendering an empty box, it renders an accessible link named by `title` that opens `src` in the system browser and logs a warning naming the package to install.
