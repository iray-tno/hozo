# @hozo/native

Hozo's optional native module. One capability: making sure a request for TalkBack's focus on Android was honoured.

Nothing in Hozo imports this package. The **application hands it in**, which is what keeps every other `@hozo/*` package installable without a Gradle or CocoaPods build. Installing this one is how an application opts into the rebuild.

Built and measured against React Native 0.87 on the New Architecture. The peer range matches every other `@hozo/*` package -- nothing here is known to need more -- but 0.87 is the only version a device has run it on.

```sh
pnpm add @hozo/native
# then rebuild the app: autolinking adds the module, and a JS reload will not
```

Then two lines beside wherever the root component is registered:

```ts
import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
import { moveAccessibilityFocus } from '@hozo/native'

setAccessibilityFocusMover(moveAccessibilityFocus)
```

No condition around the call: `moveAccessibilityFocus` is `undefined` on iOS and when the module is not in the binary, and the setter takes that and keeps the default.

Handed in rather than reached for, because Metro resolves `require` at bundle time — a library that reached for an optional package itself would fail to bundle for every application that had not installed it. `docs/decisions/006-shipping-native-code.md` has that as an amendment, found while building this.

## What it does, and why it cannot be JavaScript

`Dialog` returns accessibility focus to the control that opened it. On Android it sends the same request React Native offers JavaScript — `sendAccessibilityEvent(view, 'focus')`, which reaches `view.sendAccessibilityEvent(TYPE_VIEW_FOCUSED)` — and TalkBack honours that request unless it arrives while the windows are still settling after the dialog closed. Then TalkBack drops it, and a moment later restores focus from its own history, which may be somewhere else ([#484](https://github.com/iray-tno/hozo/issues/484) has TalkBack's own log of both).

Nothing above this package can tell those two outcomes apart: React Native passes JavaScript nothing about where accessibility focus is. This package can. It sends the same request, watches the window for the first view that takes accessibility focus, and if that is not the opener, sends the request once more — by then the windows have settled, so TalkBack honours it.

It never places focus itself. The first version of this package performed `ACTION_ACCESSIBILITY_FOCUS` directly, and measured *worse* than sending nothing at all — 15 of 40 dismissals against a control's 11 of 15 — because focus placed behind TalkBack's back is focus TalkBack then corrects.

Only the first landing after the request is acted on, and only one request is ever repeated. Anything later may be the user moving on, and pulling focus back from a user would be worse than the defect.

`moveAccessibilityFocus` resolves what happened — `landed`, `resent`, `resent-landed`, `quiet`, `unwatched`, `missing` — for diagnostics. `Dialog` ignores it.

## Android only

iOS already works. `setAccessibilityFocus` reaches `UIAccessibility` and lands every time, which is why the synchronous request in `dialog.native.tsx` is the whole mechanism there. So there is no `ios/` directory here, and `moveAccessibilityFocus` is `undefined` on iOS.

## What installing it costs

Stated plainly, because it is the only package here with a cost of this kind:

- **A rebuild.** Autolinking makes the first install a Gradle build. An app that already builds native code pays nothing new; `examples/native-demo` is in that position already.
- **Expo Go stops working** for that app, without a config plugin and a prebuild.
- **A compatibility matrix.** This package is pinned to React Native's ABI and to the New Architecture's codegen in a way the others are not.

`docs/decisions/006-shipping-native-code.md` is the record of why those costs are acceptable here and why no other `@hozo/*` package may acquire them. It also carries the gate a second capability would have to pass — three of whose four parts are about the fallback, because that is what decides whether absence is a degradation or a defect.

## If this package becomes unnecessary

If React Native starts telling JavaScript where accessibility focus is, this package should be **removed** rather than kept for the next thing.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
