---
"@hozo/patterns": minor
"@hozo/behaviors": minor
"@hozo/compiler": minor
"@hozo/engine": minor
"@hozo/primitives": patch
"@hozo/ui": patch
---

Resolve Native pattern class-name slots through the project's runtime class resolver. Pattern controls now share the primitive interaction engine and deliver hover, focus, focus-visible and pressed facts to their actual owners instead of reporting pressed alone.

Static interaction styles are additionally wired for Chip, ColorPicker swatches, Pagination page controls and CommandPalette pointer-state item slots. Selection slots and nested controls retain their own ownership: a remove button does not inherit its row's focus, and a command item does not borrow the input's focus. Other static state slots and semantic predicates remain subject to their existing diagnostics.

Styled Button receives a pressed look; Checkbox and Switch indicators are real elements on both platforms rather than Native-invisible pseudo-elements. Non-transition Native Pressables and their Text children no longer allocate animation values/listeners. Interaction ownership remains mounted when transitions are added or removed. This removes idle animation work, not every initial-mount cost or every platform delivery difference; measured list mount/update tradeoffs remain tracked separately.
