---
"@hozo/compiler": patch
---

The logical sizes (`inline-*`, `block-*` and their `min-`/`max-` forms), `origin-*`, `truncate`, `whitespace-*` and `text-ellipsis`/`text-clip` now settle in Tailwind's order. On Native, text truncation now follows the last `line-clamp-*`, `whitespace-*` and `text-overflow` written, as CSS does: `truncate whitespace-normal` no longer truncates, and `line-clamp-2 line-clamp-3` shows three lines. The ordering policy is now `scalar-order-v43`.
