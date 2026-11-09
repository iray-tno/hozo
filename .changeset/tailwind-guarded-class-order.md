---
"@hozo/compiler": patch
---

In a captured Tailwind project, a class behind a JS guard (`cx('p-4', on && 'p-2')`) now settles against the rest of its class list in Tailwind's order, on Web and Native alike. Native used to let the guarded `p-2` win whenever `on` held, unlike Web. The ordering policy is now `scalar-order-v35`.
