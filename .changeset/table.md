---
"@hozo/semantics": minor
"@hozo/core": minor
"@hozo/compiler": minor
---

Add `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead` and `TableCell`.

- **Web:** they are the table elements themselves, and a header cell is `scope="col"` unless the author says otherwise.
- **React Native,** which has no table:
  - Each column is as wide as its widest cell, the way the browser's automatic table layout does it. A table is shrink-to-fit by default, shares out the spare room in proportion with `w-full`, shrinks its columns to fit when too wide, or scrolls sideways with `scrollable`.
  - A data cell is read with its column's header ("Price, $12").
  - Each cell carries its row and column for TalkBack.
