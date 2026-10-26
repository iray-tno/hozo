# RFC 008: Window splitter

Status: implemented (initial slice, reviewed Web speech wording). Tracking: [#1191](https://github.com/iray-tno/hozo/issues/1191).

`@hozo/behaviors` owns `useDrag1D`; `@hozo/patterns` owns `Splitter` and
`ResizablePane`; `@hozo/ui` supplies their look. `@hozo/core` re-exports the
unstyled patterns. No new runtime or native dependency is required.

The first implementation covers the drag behavior, both platform patterns,
class-slot inventory, styled components, docs demo and Storybook story.
BottomSheet and Slider now share this behavior on Web and Native. Envarly
adoption is deferred until release and belongs in that application's repository.

BottomSheet keeps its detent and velocity projection in `sheet-rules.ts`.
The behavior delivers the final delta and velocity even before a queued frame
has rendered; cancellation restores the gesture's starting fraction without
dismissing. Native waits for more than 2px of vertical movement so ordinary
handle taps still cycle detents. Web ignores the click generated after a drag
while preserving keyboard activation. Geometry validation can veto a start
before Web pointer capture is acquired.

BottomSheet regression coverage uses real Chromium capture (including movement
outside the handle, cancellation and capture loss), frame-controlled final
release, tap/keyboard activation, raw velocity, closing and unmount cleanup.
Native mock hosts check responder negotiation, final position and velocity,
termination, closing and unmounting. These do not verify device responder
delivery or physical screen-reader behavior.

Slider keeps track-local positioning and snapping in the pattern and
`slider-rules.ts`. Pressing the track updates immediately; later moves are
coalesced, and release applies its final position before one commit. The axis
and direction are frozen per gesture while the measured track size stays live.
Cancellation, disabling or unmounting discards queued movement and notifies
`onValueCancel` without committing. Already delivered previews remain under the
caller's control; the media seek binding clears them on cancellation.

Slider regression coverage exercises horizontal/vertical and LTR/RTL input,
real Web capture and capture loss, keyboard/Native adjustable actions, live
resizing, controlled values, final release before a frame, and ColorPicker's
final hue on both platforms. Native checks use mock hosts, not device input.

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
| Web DOM | Named region; separator value, controls and orientation; hidden/inert collapse; maintainer-approved NVDA/VoiceOver event wording | Audible speech quality is outside the captured evidence |
| Chromium input | Real pointer capture, all four sides and RTL, release/cancel; keys and Tab out of a collapsed pane | Physical touch and pen |
| Native mock hosts | Real React state, responder release, size actions, collapsed facts and hidden descendants | Android/iOS layout and responder delivery |
| Native screen readers | Story available in the docs showcase | TalkBack/VoiceOver actions and announcements |

`examples/storybook-demo/scripts/splitter.test.mjs` executes browser input and
Native mock-host tests; package tests exercise coalescing, cancellation and
server markup. These are not device pixels, timing or screen-reader speech
measurements. The `patterns-resizablepane--default` story is discovered by
the real-reader suite. [The captured speech review](../measurements/code-block-splitter-readers.md)
links the successful NVDA/VoiceOver run and separates transcript inspection
from human approval.

## Completion evidence

- [#1276](https://github.com/iray-tno/hozo/issues/1276): actual NVDA/Chrome and
  VoiceOver/Safari speech for the named separator, size changes, bounds,
  collapse and restoration. `examples/screen-readers/code-and-splitter.spec.ts`
  records the keys, corresponding DOM facts and speech. The maintainer
  approved the recorded wording on 2026-10-26; the committed expectations
  passed on both readers in [run 40274993354](https://github.com/iray-tno/hozo/actions/runs/40274993354),
  40/40 cases each. Audible pronunciation/prosody remains outside that approval.

On 2026-10-26 the maintainer deferred physical-device validation in line with
the rest of the repository. Android/iOS layout, responder delivery and
TalkBack/VoiceOver actions remain unverified in
[#1277](https://github.com/iray-tno/hozo/issues/1277) and the public
[known limitations](../../apps/landing/src/content/docs/docs/status.md).
They no longer block this RFC's initial implementation; no device pass is
inferred from mock-host tests or Web recordings.

The implementation and agreed completion evidence are complete. Native
hardware keyboards, double-click reset and pane groups remain outside the
first slice; Envarly adoption remains post-release application work.
