---
title: "Metro (React Native, Expo)"
description: "Add Hozo to a React Native or Expo app."
sidebar:
  order: 3
---

```sh
npm install --save-dev @hozo/metro @hozo/compiler
npm install @hozo/core
```

```js
// metro.config.js
const { getDefaultConfig } = require('@react-native/metro-config')
const { withHozo } = require('@hozo/metro/config')

// Exported as a promise, which Metro awaits: the project-wide candidate
// module has to be generated before the bundle starts.
module.exports = withHozo(getDefaultConfig(__dirname), { css: 'src/theme.css' })
```

**On React Native 0.87, pin androidx.collection on Android.** This is not
Hozo's bug, but any app on 0.87 can hit it. React Native 0.87 keeps Android's
view registry in androidx.collection's `MutableIntObjectMap`, and the 1.4.0–1.4.2
versions it resolves can lose entries after a run of removals. Views that were
never deleted then stop receiving updates: text stays stale, buttons stop
responding, and logcat says `Unable to find viewState for tag N`.
`examples/native-demo` hit this in about half its runs until it pinned the fix:

```groovy
// android/app/build.gradle
dependencies {
    implementation("androidx.collection:collection:1.4.4")
}
```

React Native 0.86 uses a different registry by default, and 0.88 ships 1.4.4
([reactwg/react-native-releases#1426](https://github.com/reactwg/react-native-releases/issues/1426)),
so the pin is for 0.87 only.
