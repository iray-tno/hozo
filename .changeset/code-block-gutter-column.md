---
'@hozo/patterns': patch
---

A Native `CodeBlock` whose lines do not wrap draws its line numbers and mark glyphs as one column beside the lines, instead of a `View` and a `Text` in every row, when that draws the same. That means every row is one line high and a mark changes a gutter cell only by its colour and background, which holds for `@hozo/ui`'s classes. Otherwise each row keeps its own cell.
