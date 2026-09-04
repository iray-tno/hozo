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
- **39/39 stories passing** with **0 automated violations**.
- Catches machine-testable issues: color contrast thresholds, missing labels, invalid ARIA roles/attributes, and duplicate IDs.
- *Note*: Automated audits cover the rule-based subset of accessibility. Interactive keyboard trap behavior and real-world screen reader usability (VoiceOver, TalkBack, NVDA) require ongoing empirical testing.

## Development

Run the Storybook dev server:

```sh
pnpm --filter @hozo/example-storybook storybook
```

Run the automated accessibility test suite:

```sh
pnpm --filter @hozo/example-storybook test
```

