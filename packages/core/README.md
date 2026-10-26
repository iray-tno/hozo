# @hozo/core

The zero-setup entry point to Hozo. Import components from here instead of `react-native`, and the compiler lowers them to semantic DOM and CSS on Web, or to real React Native components and a `StyleSheet` on Native.

`@hozo/core` owns no implementation. It re-exports the component packages listed [below](#what-it-re-exports), and compiled output imports through its `@hozo/core/generated/*` entry points, so an application needs this one dependency for all of them.

```tsx
import { Section, Text, Heading, Pressable } from '@hozo/core'

export function Card({ title, onOpen }) {
  return (
    <Section className="p-4 rounded-lg bg-white">
      <Heading level={2} className="text-xl">{title}</Heading>
      <Pressable accessibilityRole="button" onPress={onOpen}>
        <Text>Open</Text>
      </Pressable>
    </Section>
  )
}
```

On Web that `Section`/`Heading` pair becomes `<section>` and `<h2>` with a scoped class, not a pair of `<div>`s. The primitives with no React Native equivalent — `Section`, `Article`, `Nav`, `List`, `ListItem`, `Paragraph`, `Heading` — exist so that the semantics can be *stated* rather than inferred from a `View` that happens to look like a heading.

Give `Pressable` an `href` when the whole custom surface is navigation, such as a card or list row.
It remains a real `<a>` on Web and a link-role Pressable on Native, while `external`, `replace`,
disabled state, and an installed `@hozo/navigation` router keep the same behavior as `Link` and
`Button href`.

## These also run

Every component here is a working React implementation, not a marker the compiler consumes and discards. When Hozo isn't in the build, or can't fully lower a particular usage, the same code renders through these — with the accessibility props mapped to ARIA either way. That is what makes adoption incremental and what makes a Storybook story render before any of this is set up.

The Native counterparts are chosen the same way: `Image` maps to React Native's `Image`, `ScrollView` and `FlatList` to theirs, so the virtualized list stays virtualized.

## Merging a caller's className

`cx` joins class strings and skips falsy ones, as `clsx` does for strings. Use it where a component adds a caller's `className` to its own:

```tsx
import { cx, Pressable } from '@hozo/core'

<Pressable className={cx('p-4 hover:bg-blue-500 disabled:opacity-50', className)} />
```

The compiler reads a `cx` call argument by argument, so the component's own classes still compile and only `className` is resolved at runtime. On React Native this is what keeps `hover:`, `disabled:` and the other state styles. A project's own helper, such as shadcn/ui's `cn`, is read this way only when the project declares it with the `classHelpers` option; otherwise the whole call is resolved at runtime and those states are dropped there. `cx` is implemented in `@hozo/engine`, so the packages below core can use it too.

## Accessibility props

The universal props follow React Native's names — `accessibilityLabel`, `accessibilityHint`, `accessibilityState`, `accessibilityValue`, `accessibilityLiveRegion`, `testID`, `nativeID` — and map onto ARIA on Web. `role` is accepted directly as well; React Native has supported it since 0.71, so it means the same thing on both sides.

`Pressable` takes them too. It did not until recently — its props extended only the responder set, so `testID` and `accessibilityState` were not part of its contract at all, which is a strange place for the gap to be: an interactive element is exactly where `aria-checked`, `aria-expanded` and `aria-selected` earn their keep.

## What it re-exports

| Package | Provides |
| --- | --- |
| [`@hozo/primitives`](https://github.com/iray-tno/hozo/tree/main/packages/primitives) | `View`, `Text`, `Pressable`, `Button`, `Link`, `Image`, `TextInput`, `ScrollView`, `FlatList` |
| [`@hozo/semantics`](https://github.com/iray-tno/hozo/tree/main/packages/semantics) | Landmarks and document structure: `Main`, `Header`, `Section`, `Article`, `Nav`, `List`, `Details`, and more |
| [`@hozo/typography`](https://github.com/iray-tno/hozo/tree/main/packages/typography) | `Heading`, `Paragraph`, inline text semantics, and accessible CJK `Ruby` |
| [`@hozo/patterns`](https://github.com/iray-tno/hozo/tree/main/packages/patterns) | `Dialog`, `Tabs`, `Menu`, `Listbox`, `Combobox`, `RadioGroup`, `Toolbar`, `Tree`, `Tooltip` |

Every primitive, and what it compiles to on each platform, is generated into [docs/primitives.md](https://github.com/iray-tno/hozo/blob/main/docs/primitives.md).

React Native migration APIs ([`@hozo/rn-compat`](https://github.com/iray-tno/hozo/tree/main/packages/rn-compat)) and SVG ([`@hozo/svg`](https://github.com/iray-tno/hozo/tree/main/packages/svg)) are not re-exported. They are opt-in, and an application that uses them depends on them directly.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a universal UI framework for React Native, compiled by Rust, with native semantics on every platform, first-class accessibility, and diagnostics for humans and AI agents alike. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://iray-tno.github.io/hozo/docs/getting-started/). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
