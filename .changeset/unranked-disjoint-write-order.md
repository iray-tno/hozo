---
"@hozo/compiler": patch
---

A class Hozo cannot rank no longer splits the ranked classes around it when its whole CSS footprint shares no property with theirs. `rtl:p-4 bg-brand rtl:p-2 p-1` in RTL now selects `rtl:p-4`'s padding on static Web and Native, as Tailwind does, where `bg-brand` is a project utility that also writes a border width. A class that also writes padding, by shorthand, logical alias or edge, still keeps the written order around it.
