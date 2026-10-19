---
title: "Accessibility"
description: "ARIA as the vocabulary, checked at build time, and what is read by real screen readers."
sidebar:
  order: 3
---

ARIA is the vocabulary. React Native has supported the `role` prop since
0.71, so a single `role="switch"` means the same thing to both backends;
`accessibilityRole` is still accepted and mapped where the two differ
(`header` → `heading`, `search` → `searchbox`, `image` → `img`,
`adjustable` → `slider`).

The role table is generated from
[`aria-query`](https://www.npmjs.com/package/aria-query) — the machine-readable
ARIA specification that `eslint-plugin-jsx-a11y` and Testing Library read —
rather than hand-kept, so it cannot quietly drift. With it the compiler can
say more than "that is not a role":

- an abstract role (`role="widget"`) is named as one, not rejected as unknown
- a role used without the states or properties it is meaningless without is
  reported as an incomplete pattern
- a role with no Web equivalent is reported rather than silently dropped

`@hozo/behaviors` carries the headless primitives that need real runtime behaviour — focus
management, keyboard handling, floating positioning, and hover delay groups.
`@hozo/patterns` builds stateful widgets on them with the WAI-ARIA keyboard
contract built in, on the Web and on Native; the
[Storybook](../../../storybook/) shows each one.

Every Storybook story is continuously checked against `axe-core` in CI,
catching automated regressions in contrast, structural ARIA syntax, and roles
with zero violations. Real screen readers read part of it weekly: NVDA and
VoiceOver over the Storybook patterns, and TalkBack over the Native demo app's
controls. iOS VoiceOver is not automated. Full conformance still requires
manual screen reader testing.
