---
"@hozo/compiler": patch
---

An element keeps its attribute evaluation plan only where a backend would otherwise run its values out of order or more than once. Where the backend already writes them in the order they were authored, the output is what it was before the plan existed: for example `<View className={cls()} accessibilityLabel={label()}>`, or a `<Text accessibilityLabel={…} style={…}>` on the Web.
