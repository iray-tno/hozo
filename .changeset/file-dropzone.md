---
"@hozo/form": minor
"@hozo/ui": minor
"@hozo/behaviors": minor
---

Add `FileDropzone`. It is a button that opens the file picker, with dropping files on it as a shortcut on the Web. Every pick is sorted by `accept`, the size limits and the count, and what was added and what was refused (with each reason) is announced in one sentence. On React Native it opens the application's `pickFiles`, or `expo-document-picker` when installed. With neither, it is disabled and says no picker is available.
