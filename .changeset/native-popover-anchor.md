---
"@hozo/behaviors": patch
---

On React Native, `FloatingPositioner` places its panel against the parent it is laid out in, not the window. Without a `PortalProvider` a Popover rendered inside its own wrapper and opened that wrapper's offset away from its trigger.
