---
"@hozo/compiler": patch
"@hozo/engine": patch
---

A `style` prop now wins over the classes on the inline edges it writes on React Native. `className="px-8" style={{ paddingRight: 99 }}` used to keep the class's 32, because Yoga prefers `paddingEnd` to `paddingRight` in any order. The authored edge keeps React Native's own meaning, RTL swap included.
