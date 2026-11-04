---
'@hozo/compiler': patch
---

A `className` built with `tailwind-merge`, directly or through shadcn/ui's `cn`, is no longer compiled as a plain join. `twMerge` drops a class that a later one conflicts with, so a caller's `px-2` replaces a component's `px-3`. Compiled, the component's `px-3` became a rule that the caller's Tailwind utility could not override (#1668). These calls now stay at runtime, as in 0.3.0, and `twMerge` decides. A `cn` that only wraps `clsx`, `classnames` or `cx` still compiles.
