# @hozo/core

## 0.2.0

- Keep the existing facade API and upgrade its primitive, pattern, typography, semantic and SVG owners together.
- Existing re-exported primitives benefit from React 19 ref-prop fixes and owner-package motion/accessibility repairs. Import newly added patterns and form/UI domains from their own packages; this release does not add every new widget to the facade.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/primitives@0.2.0
  - @hozo/patterns@0.2.0
  - @hozo/semantics@0.2.0
  - @hozo/typography@0.2.0
  - @hozo/engine@0.2.0
