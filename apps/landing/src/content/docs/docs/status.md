---
title: "What Hozo does not do yet"
description: "The honest list: what is partial, manual or untested."
---

- **Migration is mostly manual.** `npx @hozo/migration-audit . --fix`
  moves the React Native APIs Hozo owns (`Platform`, `Keyboard`, …) to
  `@hozo/rn-compat` in source; components and everything else are still
  changed by hand.
- **No physical-device validation.** The Native backend does run on an
  Android emulator and an iOS simulator — `.github/workflows/native.yml`
  boots both, drives the demo app, and compares the accessibility tree
  each platform actually produces against what the compiler said it
  would. What is untested is real hardware. Screen readers are partly
  automated: NVDA and VoiceOver on the Web patterns and TalkBack on the
  demo app's controls, weekly. iOS VoiceOver, and anything those runs do
  not reach, is still read by hand.
- **The Grid subset is partial**, and the Tailwind surface is wide but not
  complete — `@hozo/tailwind-conformance` reports exactly which utilities
  match the real engine. Its current numbers are committed at
  [packages/tailwind-conformance/snapshot.json](https://github.com/iray-tno/hozo/blob/main/packages/tailwind-conformance/snapshot.json),
  published live at the [Conformance Matrix](../../conformance/),
  and CI fails if a change moves any of them without moving that file too.
  They are not repeated here: a number copied into prose is a number that
  can drift from the thing it describes.
