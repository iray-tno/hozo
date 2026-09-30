# Hozo Storybook

Live interactive design system and component showcase for Hozo.

The complete Hozo setup for Storybook is a single addon:

```ts
// .storybook/main.ts
export default {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@hozo/storybook'],
}
```

## Story Catalog (39 Stories)

Hozo's Storybook showcases the entire universal component hierarchy across 5 clean sections:

- **Welcome**: System architecture, package map, and quality status.
- **Core (`Core/*`)**:
  - `Button & Interactions`: Button variants, link buttons, disabled states, accessibility focus rings.
  - `Dialog`: Accessible `<dialog>` modal with tab focus trapping, Escape key, and opener restoration.
  - `Menu & Radio`: Dropdown menus with arrow navigation and radio option groups.
  - `Tabs`: WAI-ARIA tablist with linked tab panels and roving focus.
  - `Toolbar`: Action bar maintaining a single tab stop with horizontal roving navigation.
  - `Layout & Lists`: `View`, `ScrollView`, and virtualized `FlatList`.
  - `Combobox`, `TextInput`, `Tree`, `Device State`, `PanResponder`, `Responsive`, `Media & Svg`.
- **Typography (`Typography/Showcase`)**:
  - Semantic headings, inline formatting (`Strong`, `Emphasis`, `Code`, `Mark`), and CJK phonetic `Ruby`/`Rt` annotations.
- **Semantics (`Semantics/Showcase`)**:
  - HTML5 landmarks (`Main`, `Header`, `Footer`, `Aside`, `Nav`), disclosures (`Details`), and `Progress`.
- **Behaviors (`Behaviors/Showcase`)**:
  - `FloatingPopover`: Anchored popovers with collision flip/shift and outside dismissal.
  - `LiveRegionAnnouncements`: Polite and assertive screen reader vocalization queues.
  - `RovingFocusToolbar`: Keyboard arrow navigation across dynamic items.
  - `TypeaheadList`: Predictive keyboard search navigation.
  - `TooltipGrouping`: Toolbar delay warmup (700ms cold, instant 0ms warm across siblings).
  - `HoverCard`: Safe polygon bridge navigation to interactive profile cards with buttons.

## Automated Accessibility Testing

Every story is automatically built and tested against **`axe-core`** in CI:
- **54/54 stories passing** with **0 automated violations**, in **both colour schemes**.
- Catches machine-testable issues: color contrast thresholds, missing labels, invalid ARIA roles/attributes, and duplicate IDs.
- Twice, once per scheme, because `--headless=new` reports `prefers-color-scheme: dark` — so every run before [#666](https://github.com/iray-tno/hozo/issues/666) audited the dark render and never the light one. It did not matter while nothing here answered the scheme; `@hozo/ui`'s paired tokens made it two renders per story. The page reports the scheme it actually got and a mismatch fails the run, because a flag that quietly stopped working would put this back where it was while claiming to check both.
- *Note*: Automated audits cover the rule-based subset of accessibility. Real NVDA and VoiceOver read the `patterns-*` stories weekly (`examples/screen-readers`); interactive keyboard trap behavior and the rest of real-world screen reader usability still require manual testing.

And **`check-appearance.mjs`**, which asks the two questions none of the others can — axe reads the accessibility tree, the utterance goldens read text, and `@hozo/ui`'s own rules read class lists out of the source:

- **Target size**, WCAG 2.5.8: every pointer target at least 24×24, with the *Inline* and *user agent* exceptions implemented and the three that are judgements left to `KNOWN`.
- **Focus visibility**, WCAG 2.4.7: every focusable element matched by a `:focus-visible` (or an ancestor's `:focus-within`) rule in the **built** stylesheets that actually draws something. A class list can carry `focus-visible:outline-hozo-focus` and emit nothing, which is exactly what [#679](https://github.com/iray-tno/hozo/pull/679) was.

It exists because appearance went unchecked and cost three bugs in one week — a switch's knob 96px from its track, a chevron pointing the wrong way for two releases, and every `data-[x=y]` rule in the project emitting no CSS at all. All three were found by opening a browser by hand.

Its first run found **130 findings, every one in a story that writes its own class names**; `ui-gallery--default`, built from `@hozo/ui`, has none. Those are held in `KNOWN` against [#685](https://github.com/iray-tno/hozo/issues/685), and a story that gains a new one fails the build.

## Development

Run the Storybook dev server:

```sh
pnpm --filter @hozo/example-storybook storybook
```

Run the automated accessibility test suite:

```sh
pnpm --filter @hozo/example-storybook test
```

