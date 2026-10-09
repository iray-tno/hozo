---
"@hozo/semantics": patch
---

A `TableCell` (and `TableHead`) takes a `ref` to its cell element on both platforms, for focusing it or measuring where it landed.

On Native, a table's header cells no longer carry `accessibilityRole="header"`, which made TalkBack read row headers as headings too. A column header is still read as a heading ("Price, Heading"), through its collection item.
