# @hozo/webview

## 0.3.0

### Minor Changes

- [#822](https://github.com/iray-tno/hozo/pull/822) [`575b87f`](https://github.com/iray-tno/hozo/commit/575b87f9941b06fb00a8a5ae553f38d30cd22478) Thanks [@iray-tno](https://github.com/iray-tno)! - New package: `WebView`, which shows web content inside an application. On the Web it is a named, lazily loaded `<iframe>` whose `onMessage` hears only its own frame. On React Native it uses `react-native-webview` when installed, with messages parsed from JSON, and otherwise shows a named link that opens the browser. `title` is required.
