---
'@hozo/compiler': patch
---

`CLASS_NOT_DRAWN_ON_NATIVE` and `nativeClassReport` no longer report a class the Native backend draws where it is written, such as `max-h-[85vh]` (a runtime viewport size) or `backdrop:bg-*` (the scrim) on a `Dialog`. The class-level verdict answers for a class resolved on device, where neither works; a class the compiler lowered statically is now checked by lowering it. `nativeClassesDrawnStatically(source)` lists the classes left out.
