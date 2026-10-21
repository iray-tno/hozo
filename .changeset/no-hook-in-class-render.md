---
"@hozo/compiler": patch
"@hozo/metro": patch
---

On React Native, a primitive with a class that needs a hook (`dark:`, a breakpoint, a dark-paired token) inside a class component's `render` is refused at build time, with a message that says so.

Before this, the compiler hoisted `useHozoDark()` to the top of `render()`, as it does in a function component. In a class that is an invalid hook call, so it threw on every render, on the device. A function component written inside the class still gets its hook.
