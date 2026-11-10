---
"@hozo/compiler": minor
"@hozo/vite": minor
"@hozo/metro": minor
---

Compile known, supported `tailwind-merge` inputs (`twMerge` / `twJoin` and merger helpers like `cn(...inputs) => twMerge(clsx(inputs))`) at build time. When all possible class tokens are known and supported, including conditional inputs such as `cn('px-3', active && 'px-2')`, Hozo resolves utility conflicts using `twMerge`'s class-group trie and conflict table without calling `twMerge` at runtime. Opaque caller class lists keep the complete original call so custom tokens, arbitrary values, and nested conflicts retain their exact semantics. Native's runtime fallback cannot carry state variants, so required state styles must remain outside an opaque merge. Opaque `twJoin` arguments and its wrappers also stay at runtime to preserve array flattening. Helpers that call `extendTailwindMerge` or `createTailwindMerge` stay at runtime.
