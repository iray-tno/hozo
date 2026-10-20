---
"@hozo/ui": patch
---

On the Web, an `Avatar`'s initials are centred in its circle, and a `Skeleton` given a corner class such as `rounded-full` takes that shape. The Avatar lacked `flex`, which a React Native View has by default and a `<span>` does not. The Skeleton's default `rounded-hozo-control` sat beside the caller's corner class and won by stylesheet order; it is now added only when the caller's `className` names no corners.
