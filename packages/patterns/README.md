# @hozo/patterns

Accessible stateful widgets for Hozo: `Dialog`, `Tabs`, `Menu`, `Listbox`, `Combobox`,
`RadioGroup`, `Checkbox`, `Switch`, `Accordion`, `Slider`, `Toolbar`, `Tree`, `Tooltip`, `Popover`,
`BottomSheet`, `Drawer`, `Chip`, `Avatar`, `Pagination`, `Stepper`, `OtpInput`, `CommandPalette` and `ColorPicker`. Each carries its WAI-ARIA
keyboard contract on the Web and the matching accessibility semantics on React Native.

`Checkbox` and `Switch` are one control with two roles, and choosing between them chooses what a
person hears: a checkbox is "checked" or "not checked" and can also be "partially checked", while
a switch is "on" or "off" and ARIA gives its role no third value. The checkbox is a `<button role="checkbox">`
rather than an `<input>` because a real checkbox's indeterminate state is a DOM property with no
attribute — it cannot be rendered on a server, and `aria-checked="mixed"` can. Both carry
`data-hozo-state` (`checked` / `unchecked` / `mixed`) so one class list can draw all three states
without the application passing its own state back in.

`Accordion` takes `multiple` rather than being two components, and its headers are each their own
tab stop — the opposite of `Tabs`, where the strip is one stop and the arrows move within it. That
difference is what the two controls are for: a tab strip is a chooser, so stopping on each tab would
make a reader pass six things to reach the content, while an accordion's headers are each a thing to
act on. The arrow keys move between headers as well, because the Authoring Practices offer them and
a ten-item accordion is unpleasant to Tab through. `headingLevel` is a prop with a guessed default,
because a heading level is a fact about the page rather than about the component.

`Slider` keeps its arithmetic in `slider-rules.ts` and exports it, because the hard part of a slider
is not the markup: where a drag lands, how a step snaps, and what a key does are all pure functions
that both platform halves import, so the two cannot disagree. On the Web the gesture is pointer
events with `setPointerCapture`, which is what keeps a drag working after the pointer leaves the
track — exactly when a person is trying hardest to reach the end. On React Native it is a
`PanResponder`, and the thumb also answers `increment` and `decrement`, because with a screen reader
on, a swipe sends those instead of a pan and a slider that only listens to the pan cannot be moved
at all. `valueText` becomes `aria-valuetext`: "3" is not an answer to "how loud".

`Popover` is [#142](https://github.com/iray-tno/hozo/issues/142)'s equation and nothing else:
`FloatingPositioner + FocusScope + DismissableLayer`. It needs nothing new from `@hozo/behaviors`,
which is what makes it worth having — the composition already existed *inside* `DatePicker`, and
this is the same arrangement with the contents left to the caller.

Two decisions in it are worth knowing. It is **not modal by default**, because `aria-modal` and a
Tab trap have to travel together or each does its worse half: a reader stops offering the page
while the keyboard walks straight out of the panel. `DatePicker` is modal for a reason — a grid you
arrow around is unusable with Tab escaping it — and a card with two links in it is not that. And a
non-modal panel **closes when focus leaves it**, which is the half people forget; without it you get
an open panel sitting behind the page. On React Native there is no `DismissableLayer`: no Escape key,
and an outside press needs a full-screen catcher, which is a modal by another name. So the trigger
dismisses it, and `accessibilityViewIsModal` stands in for `aria-modal`.

It is `aria-haspopup="dialog"` rather than `"menu"`, which is the line between it and `Menu`: a
reader told "menu" expects commands and a popover holds a form.

`BottomSheet` is the other half of [#142](https://github.com/iray-tno/hozo/issues/142):
`Portal + FocusScope + DismissableLayer` and a gesture, which is the part that is deliberately *not*
a Behaviour -- press and pan are delegated to React Native's responder system rather than owned, so
the arithmetic goes in `sheet-rules.ts` and each platform writes the gesture in its own vocabulary.
Pointer events with `setPointerCapture` on the Web, a `PanResponder` on React Native, and one module
deciding which detent a flick lands on so the two cannot disagree. Its velocity convention is the
same on both sides without a conversion, because `gestureState.vy` and a `clientY` delta are both
positive downward and both in pixels per millisecond.

It is **modal**, which is the opposite end of `Popover`'s argument and the same rule: a sheet has a
scrim, something that dims the page has already said the page is unavailable, so `aria-modal` and the
Tab trap have to say it too. The drag handle is the interesting piece of its accessibility. With one
detent there is nothing to resize, so it is decoration a reader is not shown -- drag-to-dismiss
already has the tap alternative WCAG 2.5.7 asks for, in the scrim. With several it becomes a named
button that cycles detents and answers the arrows, because then dragging is the only way to change
the size. On React Native the sheet is a `Modal`, so Android's back button dismisses it through
`onRequestClose` -- the thing `Popover` cannot offer there -- and the `escape` accessibility action
answers VoiceOver's two-finger scrub.

`Drawer` closes #142 and is the same composition against a side edge, with the gesture on one
platform only. That is #142's own split rather than a shortcut: the Web drawer is asked for an
off-canvas panel, a focus trap and a scroll lock, and the gesture is listed under Native. A drawer
has no grabber, so a swipe has to drag the panel's own body -- which fights text selection on a
desktop and fights nothing on a phone, where there is also no Escape key to fall back on. The
arithmetic is still `sheet-rules.ts`: it is written as "fraction showing", "travel away from open"
and "velocity away from open" and knows nothing about which direction away is, so a left-hand drawer
negates one axis and reuses every line of it.

`side` is `'start'` or `'end'` as well as `'left'` or `'right'`.
- `'start'` is the edge a line of text begins at, so a navigation drawer written `side="start"` opens from the right in Arabic or Hebrew without the application choosing a side per language.
- The direction comes from `HozoI18nProvider`'s `dir` when there is one (decision 008). Otherwise it comes from the platform: the document's resolved direction on the Web, `I18nManager.isRTL` on React Native.
- `useHozoDrawerSide` is exported for a look that needs the resolved edge, as `@hozo/ui`'s does.
- The default is still `'left'`, so existing drawers do not move.

**Edge-swipe-to-open is deliberately absent**, in both halves: a
closed drawer cannot listen at the screen's edge without keeping an invisible catcher over the
application's content for as long as it is closed, which is a decision about the screen rather than
about the drawer, and it collides with the platforms' own back gestures. It can never be the only
way in either, since nobody who cannot swipe could reach it.

`useScrollLock` is the one thing a real `<dialog>` gives away for free and a `position: fixed` panel
does not, so both `Drawer` and `BottomSheet` call it: without it a wheel over the scrim scrolls the
page a reader has just been told is unavailable. The locks are counted, because a drawer can open a
sheet and two overlays each restoring what they found would leave the page locked for good.

They are built on the headless engines in `@hozo/behaviors` -- focus scopes, roving focus,
typeahead, dismissal and floating positioning -- which stay reusable on their own. Applications
usually import the widgets from `@hozo/core`, which re-exports this package.

```tsx
import { Dialog, Tabs, Text } from '@hozo/core'

export function Settings({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} accessibilityLabel="Settings">
      <Tabs
        accessibilityLabel="Settings sections"
        tabs={[
          { label: 'Profile', content: <Text>Profile</Text> },
          { label: 'Notifications', content: <Text>Notifications</Text> },
        ]}
      />
    </Dialog>
  )
}
```

## Semantic state of Chip class slots

Chip's selection uses `aria-pressed:*` classes on its standalone toggle.
Native still announces that toggle as `togglebutton` with `checked`; that
platform announcement does not create a Web `aria-checked` attribute.
With removal, `className` belongs to the outer span/View, so it does not
match the inner toggle's `aria-pressed:*`, `disabled:*` or `enabled:*`.
`removeClassName` belongs to the separate button and only gets that button's
disabled/enabled state, never selection. Neither Web owner writes
`aria-checked` or `aria-disabled`; those attributes must not be inferred
from Native announcements. Literal classes use the same owner facts through
private compiler callbacks, including negation and supported stacks, with
explicit styles last. This does not expand arbitrary dynamic-class lowering
or the candidate resolver's existing variant support.

## Semantic state of Pagination class slots

Pagination's button controls match `disabled:*`/`enabled:*`; link controls
match neither, and disabled links instead carry `aria-disabled="true"`.
The same distinction drives Native candidate classes and literal compiled
slot callbacks. Native still announces the current item as selected, but
that does not make `aria-selected:*` match: Web uses `aria-current="page"`.
Use `currentItemClassName` for current-page decoration; arbitrary aria-current
value selectors are not added here. Boundary activation stays disabled on
Native for both roles, and explicit slot styles retain precedence.

## Semantic state of Stepper class slots

Stepper's four step/status class props belong to a button when `onStepPress`
is provided, otherwise to a descriptive list item. Only the button can match
`disabled:*`/`enabled:*`. A descriptive row matches neither positive predicate,
but does match their negations in literal compiled classes, even when its
step data says `disabled`. Event predicates, including negated ones, still
require the optional button; its absence must not activate `not-hover:*`.
Neither owner writes `aria-selected` or `aria-disabled`. Native's current-step
`selected` announcement and real disabled activation guard remain unchanged;
they are not CSS attributes. Use `currentStepClassName` for current status
(Web uses `aria-current="step"` on the list item).

Candidate classes and private compiled callbacks use the same owner facts.
Indicators and descriptions do not borrow disabled/enabled or ARIA semantics;
text still inherits the step's typography before explicit slot overrides.
This adds no compiled decorative state handling and does not expand
arbitrary dynamic classes, runtime negation/enabled variants, or
arbitrary aria-current value selectors. Existing hover/press propagation is
unchanged, not a new cross-platform parity claim.

## Focus ownership of decorative slots

`OtpInput` has one focus owner: its real input. Put `focus:*` and
`focus-visible:*` on `inputClassName`. The wrapper and virtual cells do not
borrow that focus on either platform.
Use unconditional classes in `activeCellClassName` to decorate the current
insertion cell while the field is focused, and `filledCellClassName` for cells
containing a character. Neither adds a focus stop. The virtual caret follows
the actual input selection independently of these class lists.
Negated runtime state variants still report their existing unsupported-class
diagnostics; this does not expand which variants compile on a virtual cell.

`CommandPalette`'s `shortcutClassName` styles a decorative Web span / Native
View, not another focusable command. Native shortcuts do not borrow an item's
`focus:*` or `focus-visible:*`; unconditional shortcut decoration and explicit
`shortcutStyle` remain available. This does not change the actual Native
button's focus handling, the Web input's active-descendant model, or which
static shortcut variants the compiler accepts.

`Stepper`'s clickable step owns focus, not its indicator or description.
Use `stepClassName` or its status-specific step class props for the button's
focus ring. Decorative indicator/status-indicator and description class props
do not borrow `focus:*` or `focus-visible:*`. Their text still inherits the
step's typography, including focus-driven text styles, unless the decorative
slot overrides it. Explicit slot styles retain precedence. Static decorative
focus variants remain diagnosed; this does not change the existing hover or
press propagation, or add a focus stop to descriptive steps.

## Verification Matrix: `Chip`, `Avatar`, `Pagination`, `Stepper`, `OtpInput`, `CommandPalette`, `ColorPicker`

These arrived after 0.2.0 (#141, #144, #149, #150, #152, #153). What has checked them, and what has not:

| | axe (every PR) | Virtual reader (every PR) | NVDA (weekly) | VoiceOver, macOS (weekly) | TalkBack | iOS VoiceOver |
|---|---|---|---|---|---|---|
| `Chip` | ✅ | ✅ approved | ✅ approved | ✅ approved | ⬜ | ⬜ |
| `Avatar` | ✅ | ✅ approved | ✅ approved | ✅ approved | ⬜ | ⬜ |
| `Pagination` (buttons, links) | ✅ | ✅ approved | ✅ approved | ✅ approved | ⬜ | ⬜ |
| `Stepper` (list, buttons) | ✅ | ✅ approved | ✅ approved | ✅ approved | ⬜ | ⬜ |
| `OtpInput` (code, PIN) | ✅ | ✅ approved | ⬜ not yet read | ⬜ not yet read | ⬜ | ⬜ |
| `CommandPalette` (closed, open) | ✅ | ✅ approved | ⬜ not yet read | ⬜ not yet read | ⬜ | ⬜ |
| `ColorPicker` | ✅ | ✅ approved | ⬜ not yet read | ⬜ not yet read | ⬜ | ⬜ |

- **axe and the virtual reader** run on the `Patterns/…` Storybook stories (`examples/storybook-demo/scripts/check-a11y.mjs`, `check-utterances.mjs`). The virtual reader computes announcements from the ARIA and HTML-AAM specifications. It is not NVDA or VoiceOver. Its approved readings are in `examples/storybook-demo/utterances/`.
- **NVDA and VoiceOver** walk every `patterns-` story weekly and on any change to `examples/screen-readers/` (`.github/workflows/screen-readers.yml`). Their first reading of these stories was run 37790021610, and the phrases approved from it are in `examples/screen-readers/expected/`.
  - **`Stepper` read correctly on NVDA.** On VoiceOver it ran a step and its description together ("completedEmail and password").
  - A space between them did not survive (run 37796061776), because the step's sentence is visually hidden and absolutely positioned.
  - So the description is now part of that sentence, after a full stop, and hidden where it is drawn. Both forms are approved from run 37802449478, which reads "completed. Email and password" on both readers.
- **TalkBack and iOS VoiceOver** have read none of them. The unit tests assert the accessibility props React Native is given (roles, labels, `selected`, `disabled`). They do not show what a reader says.

A ✅ in the reader columns means a person read the phrases and approved them, never only that a job ran.

## Decorative control indicators

Checkbox, Switch and RadioGroup accept an optional `indicator` callback. It
receives `{ checked, disabled }` from the same state used for the control's
accessibility attributes (Checkbox includes `'mixed'`). Return
`{ className, markClassName? }` for an outline/track and optional mark/knob.
The pattern owns their span/View hosts, hides them from assistive technology,
and leaves their look entirely to those classes. Native resolves each slot
through the project's class resolver. No indicator nodes are added when this
prop is omitted. This is how `@hozo/ui` paints its indicators without duplicating
the pattern's controlled or uncontrolled state.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
