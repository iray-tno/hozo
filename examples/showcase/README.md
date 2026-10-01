# Shared showcase demos

Private, source-only example package for the Web Storybook and Expo Native
showcase. The hosts own their Storybook version, decorators, platform focus
treatment, scrolling and bundler configuration. This package owns the actual
button, typography, form, preferences (checkbox/switch), tabs and confirmation
dialog examples, without DOM or React Native imports. The dialog has closed
and initially-open stories in both hosts; the latter also audits its initial
reading order. Its opener ref uses the host's Pressable instance rather than
an HTMLElement or React Native-specific type.

It is a workspace dependency rather than a relative import into another app:
Turbo can invalidate both hosts when a shared demo changes. Both hosts must
resolve hooks to their renderer's React (Vite deduplication / Metro singleton
resolution); the demo package's development React is not another renderer.

For device setup, see [the Native showcase](../native-showcase/README.md).
