---
'@hozo/compiler': patch
---

On React Native, every `backdrop:` class on a `Dialog` reaches its scrim. Only `backdrop:bg-*` did; another, such as `backdrop:px-4`, stayed on the panel, was reported as not wired, and wrote a style entry under the scrim's key, which overwrote the scrim's own.
