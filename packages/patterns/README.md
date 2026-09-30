# @hozo/patterns

Accessible stateful widgets for Hozo: `Dialog`, `Tabs`, `Menu`, `Listbox`, `Combobox`,
`RadioGroup`, `Checkbox`, `Switch`, `Accordion`, `Slider`, `Toolbar`, `Tree`, `Tooltip` and `Popover`. Each carries its WAI-ARIA
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

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
