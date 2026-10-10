# @hozo/webview

Web content inside a Hozo application (#160): an `<iframe>` on the Web, and `react-native-webview` on React Native.

```tsx
import { WebView } from '@hozo/webview'

<WebView
  src="https://example.com/checkout"
  title="Payment form"
  onMessage={({ data }) => setPaid(data?.paid === true)}
  className="h-96 w-full"
/>
```

- **Named.** `title` is required. WCAG 4.1.2 asks every frame for a name, and a reader that lands on an unnamed frame says "frame" before the person has decided whether to go in. On Native it is the view's `accessibilityLabel`.
- **Its own messages only.** On the Web, `onMessage` receives a message only when its `source` is this iframe's window, so another frame or another tab cannot speak through it. Which origin to trust inside the frame is the application's call, on `message.origin`. On Native, a page posts with `window.ReactNativeWebView.postMessage(JSON.stringify(…))`, and the data arrives parsed, so one handler reads both.
- **Lazy** on the Web (`loading="lazy"`). `sandbox`, `allow` and `referrerPolicy` pass through to the iframe.
- **No native code of its own.** On React Native it uses `react-native-webview` when the application has installed it, which is the resolved-provider seam of #353. Without it, the address is shown as a link that opens the browser, named by `title`, rather than as an empty box. A warning says what to install.

Not part of `@hozo/core`. A web view is a dependency an application chooses, and an application that embeds nothing should carry none of it.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
