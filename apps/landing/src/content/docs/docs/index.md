---
title: "Hozo documentation"
description: "Write React Native components once; Hozo compiles them to semantic HTML and CSS on the Web and to React Native on iOS and Android."
---

Hozo is a compiler. You write components with React Native's vocabulary
(`View`, `Text`, `Pressable`, and semantic primitives such as `Heading` and
`Nav`) and Tailwind classes. The build turns them into semantic HTML, CSS and
ARIA on the Web, and into React Native components and `StyleSheet` values on
iOS and Android. What the build can read is compiled; only what it cannot read
is left to a small runtime.

Hozo is early (`0.x`). It is published and tested, and its APIs may still
change in any minor release. [What Hozo does not do yet](./status/) is the
honest list.

## Where to start

- **Trying it:** [Getting started](./getting-started/) picks the page for your
  bundler or framework.
- **Something went wrong:** [Troubleshooting](./troubleshooting/) collects the
  traps people hit first.
- **How it works:** [How styles are resolved](./guides/styles/) and
  [How the packages stack](./concepts/packages/).
- **Trying it without installing:** the [REPL](../repl/) compiles in your
  browser, and the [Storybook](../storybook/) shows every component.
