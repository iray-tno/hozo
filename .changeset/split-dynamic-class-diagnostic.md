---
"@hozo/compiler": minor
"@hozo/cli": patch
---

A class expression the compiler cannot read now says which kind it is. Before, all three kinds got `DYNAMIC_CLASS_NAME_NOT_RESOLVED`:

- `CLASS_NAME_PASSED_THROUGH` is a class prop passed on unchanged, such as `className={className}`. Its classes compile where the caller writes them.
- `CLASS_NAME_ASSEMBLED` is a class name built from pieces, such as `` `bg-${color}-500` `` or `'p-' + size`. It has a rule only when the whole name is written literally somewhere in the project.
- `DYNAMIC_CLASS_NAME_NOT_RESOLVED` remains for any other value the build cannot enumerate.

If you suppressed `DYNAMIC_CLASS_NAME_NOT_RESOLVED`, the first two now arrive under their own codes. `hozo show` treats all three as classes resolved at run time.
