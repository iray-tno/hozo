---
"@hozo/embed": minor
---

New package: `WebView`, which shows web content inside an application. On the Web it is a named, lazily loaded `<iframe>` whose `onMessage` hears only its own frame. On React Native it uses `react-native-webview` when installed, with messages parsed from JSON, and otherwise shows a named link that opens the browser. `title` is required.
