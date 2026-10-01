# @hozo/native

Hozo's optional native module. One capability: moving accessibility focus on Android.

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

`Dialog` restores accessibility focus to the control that opened it. On Android that worked about half the time ([#484](https://github.com/iray-tno/hozo/issues/484)), and [#491](https://github.com/iray-tno/hozo/issues/491) traced why through React Native 0.87's sources on the Fabric architecture:

```
AccessibilityInfo.sendAccessibilityEvent(view, 'focus')
  → FabricUIManager  "focus" → AccessibilityEvent.TYPE_VIEW_FOCUSED
  → SurfaceMountingManager  view.sendAccessibilityEvent(eventType)
```

It ends at an **event** — a notification that something happened. The thing that moves accessibility focus is the **action** `AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS`, and nothing under React Native's `Libraries/` reaches it. This package performs that action, which is the whole of its Kotlin:

```kotlin
view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
```

A timing fix was measured first and rejected: a twelve-round emulator sweep found the event ignored through 175 ms after Android's window-focus signal and honoured from 200 ms, which is a property of one emulator rather than of TalkBack. `dialog.native.tsx` still carries that delay, because it is what the fallback path depends on and because nobody has yet measured whether the *action* needs it.

## Android only

iOS already works. `setAccessibilityFocus` reaches `UIAccessibility` and lands every time, which is why the synchronous request in `dialog.native.tsx` is the whole mechanism there. So there is no `ios/` directory here, and `moveAccessibilityFocus` is `undefined` on iOS — the export is conditionally a function, so one `typeof` check in the consumer answers both "is the module linked" and "is this a platform it helps on".

## What installing it costs

Stated plainly, because it is the only package here with a cost of this kind:

- **A rebuild.** Autolinking makes the first install a Gradle build. An app that already builds native code pays nothing new; `examples/native-demo` is in that position already.
- **Expo Go stops working** for that app, without a config plugin and a prebuild.
- **A compatibility matrix.** This package is pinned to React Native's ABI and to the New Architecture's codegen in a way the others are not.

`docs/decisions/006-shipping-native-code.md` is the record of why those costs are acceptable here and why no other `@hozo/*` package may acquire them. It also carries the gate a second capability would have to pass — three of whose four parts are about the fallback, because that is what decides whether absence is a degradation or a defect.

## If this package becomes unnecessary

If React Native exposes `ACTION_ACCESSIBILITY_FOCUS` to JavaScript, this package should be **removed** rather than kept for the next thing. That is written into the decision record as the condition that reopens it.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
