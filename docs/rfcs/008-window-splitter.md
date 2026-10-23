# RFC 008: Window splitter

Status: initial implementation. Tracking: [#1191](https://github.com/iray-tno/hozo/issues/1191).

`@hozo/behaviors` owns `useDrag1D`; `@hozo/patterns` owns `Splitter` and
`ResizablePane`; `@hozo/ui` supplies their look. `@hozo/core` re-exports the
unstyled patterns. No new runtime or native dependency is required.

The first implementation covers the drag behavior, both platform patterns,
class-slot inventory, styled components, docs demo and Storybook story.
Migrating existing Slider/BottomSheet gestures onto this behavior and adopting
the pane in Envarly remain follow-ups.

## Contract

Sizes are platform layout units. A pane has finite `0 <= min <= max`; resizing
clamps to that interval. Collapse may reach `collapsedSize` (default 0, at
most `min`) and restoration remembers the last expanded size. `bigStep`
matches Slider; `largeStep` is an alias. Steps must be finite and positive.

Pointer capture and Native PanResponder retain a gesture beyond the divider.
Horizontal deltas follow the platform's writing direction; end/bottom panes
reverse the resize sign. Moves coalesce to one animation frame. Release
flushes the final position before one commit; cancellation discards a pending
frame, restores the initial size and does not commit. Persistence belongs to
the application, through `onSizeCommit`.

On Web the divider is a focusable separator naming and controlling the pane.
The named section's size reads `--hozo-pane-size`. Arrows, Shift+Arrow,
PageUp/PageDown and Home/End resize; Enter collapses/restores. Collapsed
content stays mounted but is hidden and inert. The handle stays outside it.

Native uses an adjustable View with increment/decrement and an optional
Collapse/Expand action. Collapsed descendants are hidden from accessibility.
Native hardware keyboards are not implemented. The handle has additional
hit slop. Cursor/outline classes remain subject to the existing Native
compatibility report; an inventory entry does not claim device validation.

## Accessibility verification

| Surface | Automated evidence | Still needed |
| --- | --- | --- |
| Web DOM | Named region; separator value, controls and orientation; hidden/inert collapse | NVDA and VoiceOver speech review |
| Chromium input | Real pointer capture, all four sides and RTL, release/cancel; keys and Tab out of a collapsed pane | Physical touch and pen |
| Native mock hosts | Real React state, responder release, size actions, collapsed facts and hidden descendants | Android/iOS layout and responder delivery |
| Native screen readers | Story available in the docs showcase | TalkBack/VoiceOver actions and announcements |

`examples/storybook-demo/scripts/splitter.test.mjs` executes browser input and
Native mock-host tests; package tests exercise coalescing, cancellation and
server markup. These are not device pixels, timing or screen-reader speech
measurements. The `patterns-resizablepane--default` story is discovered by
the existing real-reader suite; its speech baselines need a reader run.
