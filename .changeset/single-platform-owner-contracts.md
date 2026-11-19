---
'@hozo/compiler': patch
'@hozo/form': patch
'@hozo/metro': patch
---

Support explicit single-platform owner contract shapes (`nativeHost: null` or `webHost: null`) and migrate the remaining five `@hozo/form` slots (`FileDropzone.activeClassName` on Web; `NativeSelect.{indicatorClassName,sheetClassName,scrimClassName,optionClassName}` on Native), bringing `formPendingOwners` to `0`.
