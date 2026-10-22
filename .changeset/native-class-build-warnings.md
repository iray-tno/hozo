---
"@hozo/compiler": patch
"@hozo/metro": patch
---

Metro now warns, at the prop, about a class React Native cannot draw when the class sits somewhere the build would otherwise say nothing about it. The warning code is `CLASS_NOT_DRAWN_ON_NATIVE`. It fires in two places:

- a class prop handed to a pattern, such as `handleClassName="before:block"` on a `BottomSheet`;
- a class list on a lowered element that the compiler could not take apart, so it was resolved on device.

Only classes Native cannot draw at all are reported. A cursor or a transition is not, and a dependency's files under `node_modules` are not.

`compileNativeModule` returns these warnings in a new module-level `diagnostics` field.
