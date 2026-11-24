---
'@hozo/vite': patch
---

`CLASS_NOT_IN_RUNTIME_MAP` is no longer reported in a project that also runs Tailwind's own Vite plugin (`@tailwindcss/vite`). That plugin generates a rule for every class written in the sources it scans, so a class in a file outside Hozo's `content` is not missing. This covers a migration that hands Hozo some folders and leaves the rest to Tailwind. A project without that plugin is checked exactly as before.
