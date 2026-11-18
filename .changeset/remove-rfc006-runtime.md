---
"@hozo/core": minor
"@hozo/primitives": minor
"@hozo/compiler": minor
"@hozo/patterns": patch
"@hozo/engine": patch
---

RFC 006's whole-component Native text inheritance route is removed, now that [decision 013](https://github.com/iray-tno/hozo/blob/main/docs/decisions/013-text-inheritance-compiled-where-visible.md) is the default. The internal `textInheritance` and `textStatic` compile options are gone. So are the generated components that only that route emitted: `HozoInheritedText`, `HozoInheritedView`, `HozoInheritedRelativeText`, `HozoInheritedPressable` and `HozoInheritedLabel`, with their `@hozo/core/generated/*` and `@hozo/primitives/generated/*` entries. Compiled output never referred to them unless the internal option was set. Native Chip's internal `hozoInheritedLabel` and `hozoInheritedText` props are gone too, along with the colour-motion field of the inheritance protocol, which only RFC 006's pressable published.
