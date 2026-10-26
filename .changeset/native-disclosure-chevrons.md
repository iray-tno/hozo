---
'@hozo/patterns': patch
'@hozo/form': patch
'@hozo/ui': patch
---

`Accordion` and `NativeSelect` show their chevrons on React Native. `@hozo/patterns`' `Accordion` takes an `indicator` callback, given each header's `expanded` and `disabled`, which draws a hidden node after the header, the same slot `Checkbox`, `Switch` and `RadioGroup` have. `@hozo/form`'s `NativeSelect` takes `indicatorClassName` for a hidden node after the value on React Native; the Web `<select>` draws its own. `@hozo/ui` uses both instead of an `::after` chevron, which React Native cannot draw.
