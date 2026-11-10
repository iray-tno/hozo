---
"@hozo/compiler": minor
"@hozo/vite": minor
"@hozo/metro": minor
---

Compile `tailwind-merge` (`twMerge` / `twJoin` and project helpers like `cn(...inputs) => twMerge(clsx(inputs))`) at build time. When all arguments are static or conditional (`cn('px-3', active && 'px-2')`), Hozo resolves utility conflicts using `twMerge`'s class-group trie and conflict table without calling `twMerge` at runtime. When a static base is combined with a runtime `className` (`cn('px-3 py-1 hover:bg-blue-500', className)`), Hozo emits a compact per-group conflict check so the caller's conflicting utilities win on both Web and React Native while keeping the component's own `hover:` / `active:` states compiled. Helpers that call `extendTailwindMerge` or `createTailwindMerge` stay at runtime.
