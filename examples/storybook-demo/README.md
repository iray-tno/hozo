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

## Story Catalog

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
- The denominator comes from the built `index.json`: every story is audited in **both colour schemes**, with no retries or disabled rules. The current completed count is printed by the runner, not maintained here by hand.
- Catches machine-testable issues: color contrast thresholds, missing labels, invalid ARIA roles/attributes, and duplicate IDs.
- Twice, once per scheme, because `--headless=new` reports `prefers-color-scheme: dark` — so every run before [#666](https://github.com/iray-tno/hozo/issues/666) audited the dark render and never the light one. It did not matter while nothing here answered the scheme; `@hozo/ui`'s paired tokens made it two renders per story. The page reports the scheme it actually got and a mismatch fails the run, because a flag that quietly stopped working would put this back where it was while claiming to check both.
- *Note*: Automated audits cover the rule-based subset of accessibility. Real NVDA and VoiceOver read the `patterns-*` stories weekly (`examples/screen-readers`); interactive keyboard trap behavior and the rest of real-world screen reader usability still require manual testing.

The catalogue is split into batches of at most 32 stories per scheme, run
serially with one browser/page active. Each batch has a four-minute limit;
the catalogue has an eight-minute limit including browser launch (previously
four minutes for the whole growing catalogue). Navigation and render/font/
finite-animation readiness retain their ten-second bounds. Neither a timeout
nor an unvisited story is an axe violation, but both still fail the check.
An audited story can also fail on genuine axe findings. Known findings never
suppress execution errors or incomplete coverage.

`storybook-static-check/_a11y-result.json` records every expected story/scheme,
its audited/error/not-run status, the last preparation stage, findings and
durations, plus batch timings and budgets. CI, the dedicated browser-audit job
and main's integration report upload it as `storybook-a11y-evidence` when
available. The run log distinguishes actual violations from harness failures
and includes the audited/expected denominator. No shorter reading-order golden
or unchanged-state check is approved by this audit.

And **`check-appearance.mjs`**, which asks the two questions none of the others can — axe reads the accessibility tree, the utterance goldens read text, and `@hozo/ui`'s own rules read class lists out of the source:

- **Target size**, WCAG 2.5.8: every pointer target at least 24×24, with the *Inline* and *user agent* exceptions implemented and the three that are judgements left to `KNOWN`.
- **Focus visibility**, WCAG 2.4.7: every focusable element matched by a `:focus-visible` (or an ancestor's `:focus-within`) rule in the **built** stylesheets that actually draws something. A class list can carry `focus-visible:outline-hozo-focus` and emit nothing, which is exactly what [#679](https://github.com/iray-tno/hozo/pull/679) was.

It exists because appearance went unchecked and cost three bugs in one week — a switch's knob 96px from its track, a chevron pointing the wrong way for two releases, and every `data-[x=y]` rule in the project emitting no CSS at all. All three were found by opening a browser by hand.

Its first run found **130 findings, every one in a story that writes its own class names**; `ui-gallery--default`, built from `@hozo/ui`, had none. [#685](https://github.com/iray-tno/hozo/issues/685) fixed 129 of them — the focus ring is now part of every class list that styles hover, which is the rule `@hozo/ui` already holds itself to, and the four undersized targets are 24px or more.

The last one was `@hozo/three`'s accessible controls, which were clipped whether or not they had focus — a sighted keyboard user landed on something invisible ([#689](https://github.com/iray-tno/hozo/issues/689)). They are revealed on focus now, and `controlClassName` dresses them.

So **`KNOWN` is empty**, which is the state it should be judged by: a story that gains a finding fails the build, and an entry that stops firing fails it too and asks to be deleted.

## Development

The built shared-showcase interaction check covers nine scenarios, including
Video, captions, Audio, poster lifecycle, SVG filters and focus restoration.
It waits for authored controls and observable operation results in real time,
within one 60-second wall-clock budget including browser launch. A loaded
iframe is not proof that React has rendered its controls. Paused Video uses
`preload="metadata"`, so caption readiness cannot require `canplay`, and the
initial poster is checked against its own image load rather than a decoded
video frame. Disabled/inert/no-autoplay assertions cross a render turn and
retain their original 250ms observation horizon. These checks do not replace the media package's decoder/pixel
tests or physical-device and assistive-technology verification.

`storybook-static-check/_shared-interactions-result.json` records the last
reported waiting stage, completed scenarios and observed media state on success
or failure. The parent DOM is also saved when the browser is still available.
CI uploads these as `shared-showcase-interaction-evidence`; a timeout, browser
error or incomplete scenario list still fails the test.

Reading-order checks use the same settled-story barrier as the axe audit,
within the existing 5.5-second load/preparation budget. An empty React root
cannot be approved as an empty finished traversal. The 400-step traversal
limit, six-minute run bound and checked-in utterance goldens are unchanged.
Full reading results and preparation errors are saved in
`storybook-static-check/_utterances-result.json` and uploaded with the evidence.

Run the Storybook dev server:

```sh
pnpm --filter @hozo/example-storybook storybook
```

Run the automated accessibility test suite:

```sh
pnpm --filter @hozo/example-storybook test
```

