---
"@hozo/compiler": patch
---

In a captured Tailwind project, a class behind a media, container or supports query now beats the unprefixed class in either authored order, as it does in Tailwind. `md:p-4 p-2` used to keep `p-2` at every width, and `lg:p-8 md:p-4` let `md:` win above `lg`. This applies to breakpoints, `max-*`/`min-[…]`, `dark:`, the environment queries such as `print:` and `motion-reduce:`, `@md:` container queries and `supports-[…]:`. The ordering policy is now `scalar-order-v9`, so cached output from v8 is invalidated.
