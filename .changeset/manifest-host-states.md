---
"@hozo/compiler": patch
"@hozo/ui": patch
---

A package component whose host is a pressable primitive now hands its `hover:`, `active:` and `focus-visible:` text classes to a Text the caller nests, on Native: the manifest records `hostStates`, and the caller's Text reads the host's state through `HozoText`.
