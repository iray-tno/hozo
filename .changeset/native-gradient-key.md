---
'@hozo/compiler': patch
---

Native gradients (`bg-linear-*`, `bg-radial-*`, `bg-none` and StyleX `backgroundImage`) are written as `experimental_backgroundImage`. React Native 0.86 has no unprefixed `backgroundImage` and dropped them without a warning; 0.87 reads both.
