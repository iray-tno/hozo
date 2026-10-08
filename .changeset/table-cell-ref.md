---
"@hozo/semantics": patch
---

A `TableCell` (and `TableHead`) takes a `ref` to its cell element on both platforms, for focusing it or measuring where it landed.

On Native, a table's header cells no longer carry `accessibilityRole="header"`. TalkBack read each one as a heading and put every column header into heading navigation. That a cell heads its column is still carried in its collection item.
