---
'@hozo/compiler': minor
'@hozo/engine': minor
---

The Native candidate module now emits a `hozoClassTransitions` table for transition utilities (`transition-*`, `duration-*`, `delay-*`, `ease-*`, also under `motion-reduce:` / `motion-safe:`) instead of reporting them as Web-only, and `@hozo/engine` adds `createClassTransitions` to read a runtime class string into a `HozoAnimated` transition spec.
