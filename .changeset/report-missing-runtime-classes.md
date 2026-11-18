---
"@hozo/metro": minor
"@hozo/vite": minor
"@hozo/compiler": minor
"@hozo/cli": patch
---

A class your code hands over to be resolved at run time, but that the project's candidate map lacks, is now reported while the bundler builds, under the new code `CLASS_NOT_IN_RUNTIME_MAP`. The warning names the file and line. Before, such a class just did not apply, with no message.

This happens to a file outside the project's `content` (a shared demo or package source the scan never read), or to a class written after the bundler started. Metro checks every file against the map the device holds. Vite checks files outside its walk. The fix is to include the file in `content`, or to restart the bundler.

Only a name that would compile to a style is reported. A string that looks like a class but is never used as one can still be reported, and so can a class in a module constant the compiler compiles statically.
