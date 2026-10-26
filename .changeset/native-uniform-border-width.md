---
'@hozo/compiler': patch
---

On Android, a rounded `border-dashed` or `border-dotted` box is drawn dashed or dotted. A border width on all four sides now also sets React Native's `borderWidth`, which Android needs before it draws a rounded border with dashes; with four side widths alone it filled each side solid. The side widths are still written, so which class overrides which is unchanged.
