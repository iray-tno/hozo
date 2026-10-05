# @hozo/ui

## 0.2.0

- Introduce styled buttons, fields/inputs, toggles, slider, accordion, tabs, overlays, selection widgets, calendar/pickers, cards/layout and feedback components over primitives, patterns and forms.
- Ship literal-class TSX source and `theme.css` tokens for the consumer’s own Hozo build, not prebuilt component CSS. Override paired light/dark tokens in the application theme.
- Add focus-ring, contrast, target-size, selected-state and 4px layout-grid checks. Native widget slots are not universal runtime class resolution; use documented style props where required.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/core@0.2.0
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/form@0.2.0
  - @hozo/typography@0.2.0
