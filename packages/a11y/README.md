# @hozo/a11y

The accessibility patterns that need real runtime behaviour.

Most of what Hozo does for accessibility is compile-time: roles, states and properties become ARIA attributes in the markup, and the compiler reports a role used without the properties it is meaningless without. Some patterns are not markup. A dialog has to trap focus, restore it on close, and respond to Escape. That is behaviour, and it lives here.

```tsx
import { Dialog } from '@hozo/core'   // re-exported from here

<Dialog open={open} onClose={close} accessibilityLabel="Settings">
  <Text>…</Text>
</Dialog>
```

## Dialog

On Web it is a real `<dialog>` element, so the browser supplies the modal semantics, the top layer and the backdrop rather than this package reimplementing them. Focus moves to the first sensible target on open and returns to whatever had it before, and Escape closes.

On Native it is React Native's `Modal` with `accessibilityViewIsModal`, which is what tells the platform screen reader not to reach the content behind it. `animationType` defaults to `fade` rather than `slide`: a dialog animating in from an edge reads as a screen transition, and nothing in the source says which the author meant.

The focus logic itself — which candidate to focus, whether to restore — is in `focus.ts`, free of both platforms' imports, so it is tested directly rather than through a rendered tree.

## Tabs

```tsx
import { Tabs } from '@hozo/core'

<Tabs
  accessibilityLabel="Account"
  tabs={[
    { label: 'Profile', content: <Profile /> },
    { label: 'Billing', content: <Billing />, disabled: !subscribed },
  ]}
/>
```

The group is one tab stop and the arrow keys move within it. That is the
half people leave out, and without it a six-tab strip is six Tab presses
to get past rather than one.

Activation is manual: arrowing moves focus and Enter or Space selects.
The automatic form, where selection follows focus, is only correct when
every panel is already loaded and cheap to show -- otherwise arrowing from
the first tab to the fifth mounts four panels nobody asked for and a screen
reader announces each on the way past. A component cannot know which case
it is in, so this one does not choose for you.

A disabled tab keeps its place and is announced; the arrows pass over it.
It carries `aria-disabled` rather than the `disabled` attribute, which
would take it out of the accessibility tree and leave the strip with a gap
nobody can reach or be told about.

On Native there are no arrow keys and no tab order, so the strip is the
semantics alone -- `tablist`, `tab`, and which one is selected. The two
platforms agree about what a tab strip is and disagree completely about
how anyone reaches one.

The rule underneath is `roving.ts`: given a key, an orientation, a count
and which items are disabled, which index takes focus next. Tabs is the
first thing on it; menus, toolbars, radio groups and trees are the same
rule with different parameters.

## Menu

```tsx
import { Menu } from '@hozo/core'

<Menu
  trigger="Actions"
  accessibilityLabel="Actions"
  items={[
    { label: 'Duplicate', onSelect: duplicate },
    { label: 'Delete', onSelect: remove, disabled: locked },
  ]}
/>
```

ArrowDown opens onto the first item and ArrowUp onto the last, which is
how the bottom of a long menu is reached without arrowing through it.
Typing jumps: `de` goes to Delete, and pressing the same letter again
walks through every item starting with it.

Escape closes, and so does choosing an item, and both put focus back on
the button. That is the part that gets left out and the part that matters
most -- a menu that closes without returning focus drops the user at the
top of the document and nothing announces that it happened.

On Native it is a `Modal` with `accessibilityViewIsModal`, so the screen
behind it stops being readable. The keyboard half has nothing to do there:
there are no arrow keys and no tab order, and a screen reader reaches the
menu by swiping the moment it is on screen.

## Toolbar

```tsx
import { Toolbar } from '@hozo/core'

<Toolbar
  accessibilityLabel="Formatting"
  items={[
    { render: (props) => <button {...props} onClick={bold}>B</button> },
    { render: (props) => <button {...props} onClick={italic}>I</button> },
  ]}
/>
```

The controls are yours; what the toolbar supplies is the tab stop, the
arrow keys, and the props that connect them -- spread the argument onto
whatever you render. This is where one-tab-stop matters most: a formatting
bar with twelve buttons is otherwise twelve presses to get past on the way
to the text, every time, and with a mouse it behaves identically so the
mistake is invisible.

The ends do not join up here, unlike the tab strip. A toolbar is a row of
unrelated actions rather than a ring of alternatives, and arriving back at
Bold after pressing Right at the end reads as a jump.

## Radio group

```tsx
import { RadioGroup } from '@hozo/core'

<RadioGroup
  accessibilityLabel="Delivery"
  value={speed}
  onValueChange={setSpeed}
  options={[
    { value: 'standard', label: 'Standard' },
    { value: 'express', label: 'Express' },
  ]}
/>
```

Two things here disagree with every other pattern in this package, and
both are required rather than preferences.

**The arrows select.** The tab strip refuses to do that and says why --
arrowing would mount panels nobody asked for. A radio group has nothing to
mount, and it holds a single value, so a focused-but-unchosen option is a
state the control does not have. Someone who arrows to Express and tabs
away has chosen Express.

**The tab stop is the chosen option, not the last-focused one.** That is
what Tab into the group should land on: arriving at the third option
because that is where you were last time tells you nothing about what is
selected now. With nothing chosen yet it falls to the first option that
can hold it, so the group stays reachable.

## Listbox

```tsx
import { Listbox } from '@hozo/core'

<Listbox accessibilityLabel="Sort" value={sort} onValueChange={setSort}
  options={[{ value: 'name', label: 'Name' }, { value: 'date', label: 'Date' }]} />

<Listbox accessibilityLabel="Tags" multiple value={tags} onValueChange={setTags}
  options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
```

Single select follows focus, like the radio group. Multiple must not: with
twelve options, walking down to the fourth would select the first four on
the way. So the arrows move, Space toggles, and `aria-multiselectable` is
written either way -- a screen reader announces the model on entry, and
leaving it off a multi-select means someone finds out that several are
allowed by trying one.

Typing jumps, the same rule the menu uses.

## Tree

```tsx
import { Tree } from '@hozo/core'

<Tree
  accessibilityLabel="Files"
  defaultExpanded={['src']}
  selectedId={open}
  onSelect={setOpen}
  nodes={[{ id: 'src', label: 'src', children: [{ id: 'index', label: 'index.ts' }] }]}
/>
```

Up and Down move through the **visible rows**, not through siblings.
Pressing Down on the last child of an open branch goes to that branch's
next sibling -- a different parent at a different depth -- because that is
the next line on the screen. So the tree flattens to what it is showing,
and from there it is a list: roving and typeahead work unchanged.

Right opens a closed branch and steps into an open one; Left closes an
open branch and steps out of anything else. Those four cases are the only
keys a list has no answer for.

Each row carries `aria-level`, `aria-posinset` and `aria-setsize`.
Without them the tree renders identically and announces as a flat list --
the depth lives in the indentation, and indentation is CSS, which is
exactly what a screen reader does not read. On Native there is no such
attribute at all, so the position goes into the label: "lib, level 2, 2 of
2". Ugly written down, correct when heard.

## Scope

This package grows as patterns are added. Everything in it is here because it needs state, keyboard handling or platform APIs; anything that can be a compile-time attribute is not here.
