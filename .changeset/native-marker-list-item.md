---
"@hozo/compiler": patch
---

Lower Tailwind `marker:` variants on `<List>` and `<ListItem>` on React Native by synthesizing an `aria-hidden` `<Text>` marker child beside each item's content, with support for ordered list numbering, `marker:content-[...]` string literals, `marker:content-none`, and stacked ambient/relational variants.
