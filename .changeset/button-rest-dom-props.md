---
"@hozo/compiler": patch
"@hozo/primitives": patch
"@hozo/core": patch
---

A `Button` whose props reach it through a rest spread (`function B({ href, ...rest }) { return <Button {...rest} /> }`) works again on the Web. Since the compiler started deciding such a Button's element at build time, the spread reached the `<button>` or `<a>` raw, so `onPress` never became `onClick` and clicking an `@hozo/ui` Button did nothing. The spread now goes through the same translation as the uncompiled `Button`: `onPress`, `accessibilityLabel`, `accessibilityHint`, `testID`, `nativeID`, `disabled` and `data-*`. On an anchor, a press is still suppressed while disabled.
