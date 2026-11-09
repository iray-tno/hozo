---
"@hozo/compiler": patch
---

On Native, a conditional gradient constructor or stop now keeps the unconditional parts it does not override. `md:bg-linear-to-b bg-linear-to-r from-red-500` used to lose its stops at md.
