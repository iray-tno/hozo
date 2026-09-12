---
'@hozo/runtime': patch
---

Harden the Web `Animated.View` compatibility boundary: isolate React Native's private node shape,
omit unreadable animated styles with actionable development diagnostics, and reliably replace and
clean up listener subscriptions.
