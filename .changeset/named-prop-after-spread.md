---
"@hozo/compiler": patch
---

On the Web, a prop written after a spread wins over the spread, as it does in JSX and on React Native. In `<View {...props} testID="t">`, the compiled element is now `data-testid="t"`, even when `props` holds a `testID`.

The compiler emits the props it models before the spread. Since spreads are translated (`accessibilityLabel` becoming `aria-label`, and so on), a key inside the spread overrode the author's later value. Now the keys written after a spread are taken out of it. This applies to translated spreads and to spreads kept on a component such as `HozoView`. A spread with nothing written after it is unchanged.
