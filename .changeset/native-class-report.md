---
"@hozo/compiler": patch
---

`nativeClassReport(source)` lists the classes in a module's `className` and `*ClassName` props that React Native cannot draw, each with a reason. That includes class lists handed to a pattern such as `BottomSheet`, which the compiler does not lower and so never examined.

`nativeClassVerdicts(classNames)` gives the same verdict for loose class names.

- A verdict of `missing` is something the Web draws and Native does not: a pseudo-element, a scrim, a selector, a fixed position.
- A verdict of `cosmetic` is a cursor shape or a CSS transition.
- Classes that depend on state a component's Native half may supply (`hover:`, `aria-*:`, `data-*:`) are not reported.

These are not yet build warnings.
