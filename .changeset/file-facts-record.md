---
'@hozo/compiler': patch
'@hozo/metro': patch
'@hozo/vite': patch
'@hozo/next': patch
---

The project scan now records each file's ordering names, imports, class helpers and text-forwarding summary in `node_modules/.hozo/file-facts.json`, from the same read that finds its candidates (decision 014). Metro's startup class helpers and project text forwarding, and the ordering seed on Metro, Vite and Next, read those records instead of reading every file again. Nothing they produce changes. On `examples/native-showcase`, a Metro startup with warm caches went from 338 reads of project files to none, and from about 555 ms to about 262 ms. The first startup builds the records, once.
