# @hozo/patterns

## 0.2.0

- Add Checkbox, Switch, Slider, Accordion, Popover, BottomSheet and Drawer, with shared Web/Native interaction contracts and public associated types.
- Retain Popover, BottomSheet and Drawer panels during exit transitions; share the Presence/focus infrastructure rather than duplicating it.
- Improve Native Dialog opener-focus requests and expand browser/real-reader verification. Android TalkBack restoration is not universally guaranteed; see the optional native-module guide.

See the [Hozo release notes and migration steps](https://github.com/iray-tno/hozo/blob/main/CHANGELOG.md#020) for cross-package changes and measured boundaries.

### Patch Changes

- Updated Hozo dependencies:
  - @hozo/behaviors@0.2.0
