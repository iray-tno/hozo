---
title: "Native Focus (@hozo/native)"
description: "Hozo's optional Android native module for ensuring TalkBack focus restoration on Dialog dismissal."
sidebar:
  order: 6
---

`@hozo/native` is the only package in Hozo that ships native platform code, and it owns a single capability: ensuring that when a `Dialog` closes on Android, TalkBack's accessibility focus actually returns to the button that opened it.

Nothing in Hozo imports `@hozo/native`. Your application opts in by installing it and handing its function to `@hozo/behaviors/native`:

```sh
pnpm add @hozo/native
# Rebuild the Android app so React Native autolinking includes the module
```

```ts
// index.js or App.tsx (beside root component registration)
import { setAccessibilityFocusMover } from '@hozo/behaviors/native'
import { moveAccessibilityFocus } from '@hozo/native'

setAccessibilityFocusMover(moveAccessibilityFocus)
```

No platform check is needed around that call: on iOS (and on Android when the native module is not linked into the binary), `moveAccessibilityFocus` is `undefined`, and `setAccessibilityFocusMover` keeps the default JS behavior.

## Why this cannot be done in JavaScript

When a `Dialog` closes, it asks the platform to return accessibility focus to the opener.

- **On iOS,** `AccessibilityInfo.setAccessibilityFocus` reaches `UIAccessibility` and lands reliably every time. So `@hozo/native` has no `ios/` directory.
- **On Android,** JavaScript's `sendAccessibilityEvent(view, 'focus')` dispatches `TYPE_VIEW_FOCUSED`. If that event arrives while Android's window manager is still settling after the dialog's window closes, TalkBack drops the request and restores focus from its own history a moment later — leaving focus on the wrong element.

JavaScript cannot tell whether the request succeeded or was dropped, because React Native exposes no API for observing where accessibility focus landed.

`@hozo/native` observes the window's accessibility events natively:

1. It sends the initial `TYPE_VIEW_FOCUSED` request.
2. It watches the window for the first view that receives accessibility focus.
3. If that first landing is not the opener, the window has now settled, and `@hozo/native` sends the focus request **once more**.

Only the first landing is acted on, and at most one retry is ever sent, so a user who moves focus themselves is never pulled back.

## What installing it costs

`docs/decisions/006-shipping-native-code.md` records why this is an explicit opt-in package rather than part of `@hozo/core`:

- **A native build:** autolinking requires a Gradle build on first install rather than a JS-only reload.
- **No standard Expo Go:** requires a development build (`expo run:android` / prebuild).
- **React Native New Architecture ABI:** built and verified against React Native 0.87 on the New Architecture.
