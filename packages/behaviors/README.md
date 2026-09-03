# @hozo/behaviors

Universal runtime behaviors and floating positioning primitives for Hozo.

## Included Primitives

- **FloatingPositioner**: Zero-dependency floating anchoring and positioning (12 placements, flip, shift, arrow clamping, `availableDimensions` for scrollable dropdown bounds, `matchAnchorWidth` for select/combobox inputs, and `referenceHidden`).
- **DismissableLayer**: Outside click/pointerdown dismissal and Escape key handling with nested stack layers.
- **FocusScope**: Universal focus containment, initial auto-focus, and focus restoration to opener.
- **RovingFocus**: WAI-ARIA roving tabindex manager for toolbars, menus, tablists, and trees.
- **Typeahead**: Predictive keyboard navigation matching query prefixes with loop prevention.
- **Portal**: Universal React Portal rendering across Web DOM and React Native root hierarchies.
- **LiveRegion**: Universal polite and assertive screen reader live announcements.
- **Dialog**: Native `<dialog>` modal with focus restore on Web and `<Modal>` on React Native.
