---
'@hozo/compiler': patch
---

Read `className={"…"}` the way `className="…"` is read, so one uncompiled class no longer sends the whole list back to runtime. The Web owner-class path now keeps a `group` or `peer` marker on the prepared class instead of refusing the caller, and the Native one refuses a class it would otherwise drop.
