---
'@hozo/engine': patch
---

Use the captured Tailwind order when the state styles in a Native class
string are all ranked, even if another candidate in the project is
unassessed. Generated Native maps no longer need a separate flag for
fully ranked state styles.
