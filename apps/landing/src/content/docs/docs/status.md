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
  CodeBlock and Splitter share this limitation: Native layout, touch/responder
  delivery, CodeBlock's application-provided clipboard, and TalkBack/iOS
  VoiceOver interactions have not been checked on physical devices
  ([#1277](https://github.com/iray-tno/hozo/issues/1277)). The maintainer deferred
  that validation on 2026-10-26; it does not block completion of RFCs 008/009.
  Their Web NVDA/VoiceOver recordings and Android emulator performance
  measurements are separate evidence, not physical-device certification.
- **Long Native code blocks have no established smooth frame budget.** The
  [pinned Android emulator measurement](https://github.com/iray-tno/hozo/blob/main/docs/measurements/code-block-android.md)
  completed the 10–1000-line matrix, but no tested long-block count established
  a 60Hz rendering/update/scroll envelope. A 1000-line, 8000-token block took
  about 1.19s to reach its initial layout callback in that environment. Keep
  Native snippets small and measure the application's update workload;
  optimization is tracked in [#1289](https://github.com/iray-tno/hozo/issues/1289).
- **The Grid subset is partial**, and the Tailwind surface is wide but not
  complete — `@hozo/tailwind-conformance` reports exactly which utilities
  match the real engine. Its current numbers are committed at
  [packages/tailwind-conformance/snapshot.json](https://github.com/iray-tno/hozo/blob/main/packages/tailwind-conformance/snapshot.json),
  published live at the [Conformance Matrix](../../conformance/),
  and CI fails if a change moves any of them without moving that file too.
  They are not repeated here: a number copied into prose is a number that
  can drift from the thing it describes.
