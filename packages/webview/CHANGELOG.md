# @hozo/webview

## 0.5.0

## 0.4.0

### Minor Changes

- [#1597](https://github.com/iray-tno/hozo/pull/1597) [`b3df5b7`](https://github.com/iray-tno/hozo/commit/b3df5b73a8ec104fe407d89472e4339411de311d) Thanks [@iray-tno](https://github.com/iray-tno)! - React Native 0.87 is now the lowest supported version (`react-native: >=0.87`), and `@hozo/media`'s Expo peers move to SDK 58 (`expo-video`, `expo-audio` and `expo-asset` `>=58 <59`). Native gradients go under `backgroundImage` again: the `experimental_backgroundImage` spelling existed only for React Native 0.86, which read nothing else.

## 0.3.0

### Minor Changes

- [#822](https://github.com/iray-tno/hozo/pull/822) [`575b87f`](https://github.com/iray-tno/hozo/commit/575b87f9941b06fb00a8a5ae553f38d30cd22478) Thanks [@iray-tno](https://github.com/iray-tno)! - New package: `WebView`, which shows web content inside an application. On the Web it is a named, lazily loaded `<iframe>` whose `onMessage` hears only its own frame. On React Native it uses `react-native-webview` when installed, with messages parsed from JSON, and otherwise shows a named link that opens the browser. `title` is required.
