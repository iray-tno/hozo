# @hozo/patterns

Accessible stateful widgets for Hozo: `Dialog`, `Tabs`, `Menu`, `Listbox`, `Combobox`,
`RadioGroup`, `Checkbox`, `Switch`, `Toolbar`, `Tree` and `Tooltip`. Each carries its WAI-ARIA
keyboard contract on the Web and the matching accessibility semantics on React Native.

`Checkbox` and `Switch` are one control with two roles, and choosing between them chooses what a
person hears: a checkbox is "checked" or "not checked" and can also be "partially checked", while
a switch is "on" or "off" and ARIA gives its role no third value. The checkbox is a `<button role="checkbox">`
rather than an `<input>` because a real checkbox's indeterminate state is a DOM property with no
attribute — it cannot be rendered on a server, and `aria-checked="mixed"` can. Both carry
`data-hozo-state` (`checked` / `unchecked` / `mixed`) so one class list can draw all three states
without the application passing its own state back in.

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
