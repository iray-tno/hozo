# 4. Navigation determines the role, not the component name

**Status:** decided
**Date:** 2026-09-07

## Decision

An element that follows an `href` is exposed as a link on every platform.
Its component name and visual treatment do not change that role:

```tsx
<Button href="/checkout">Checkout</Button>

// Web:          <a href="/checkout">Checkout</a>
// React Native: <Pressable accessibilityRole="link">...</Pressable>
```

An element that performs an action and has no destination is a button. A
`Pressable` explicitly authored as a button remains a button as well. This
decision changes neither of those cases.

The short rule is:

> navigation is a link; an in-place action is a button; appearance decides
> neither.

## Why

WAI-ARIA 1.2 defines a link as an interactive reference whose activation
navigates to an internal or external resource. Its note recommends `button`
for the opposite case: activation that performs an action without changing
the page location.

- <https://www.w3.org/TR/wai-aria-1.2/#link>
- <https://www.w3.org/WAI/ARIA/apg/patterns/link/>
- <https://www.w3.org/WAI/ARIA/apg/patterns/button/>

That describes Hozo's `href` branch exactly. It retains a real destination,
browser context menus, modified clicks, `target`, `download`, external URLs,
and client-router interception. Calling it a button because it looks like one
would announce presentation instead of function.

React Native makes the same distinction. `accessibilityRole` communicates a
component's purpose, with separate `link` and `button` values:

- <https://reactnative.dev/docs/accessibility#accessibilityrole>

## The browser behaviour matters too

An HTML anchor with `href` already implements link activation: `Enter`
follows it. Changing only its ARIA role does not turn it into a native button;
in particular, it does not acquire button-style `Space` activation.

ARIA in HTML permits `role="button"` on `a[href]`, so that markup is not
categorically invalid. It is appropriate only when the element really
implements a button command and supplies the complete button interaction.
Hozo's `Button href` does not: following the destination is its primary
function.

- <https://www.w3.org/TR/html-aria/#docconformance>

## What was rejected

### Keep the button role and emulate Space

Rejected. It would make the announced role's keyboard contract internally
consistent, but it would still describe navigation as an action and would
make a destination behave unlike every other link. It also adds script to a
case where both platforms already have the correct native behaviour.

### Infer the role from the component name

Rejected. `Button` is useful as a styling and API primitive for prominent
calls to action, but `href` changes what activation does. Hozo already follows
platform semantics rather than forcing one host element per source name.

### Diagnose every explicitly button-role link

Rejected as a blanket rule. ARIA in HTML deliberately allows an anchor to be
recast as a button for the narrower command-with-hyperlink-fallback pattern.
Hozo's public `ButtonProps` and `LinkProps` do not expose such a role override,
so correcting Hozo's own generated role is sufficient. A future API that
allows the pattern must validate its activation contract rather than warning
from `href` and role alone.

## Where the rule lives

The compiled and fallback paths must agree:

- `crates/hozo_web/src/markup.rs`: `Button href` becomes an unadorned anchor.
- `crates/hozo_native/src/markup.rs`: it becomes `HozoLink` with its link-role default.
- `packages/core/src/index.tsx`: the Web fallback does not override `HozoLink`.
- `packages/core/src/primitives.native.tsx`: the Native fallback does not override it.
- `packages/tailwind-conformance/src/link-role.test.ts`: verifies the rendered Native role.

`packages/runtime/src/activate.ts` remains the correct implementation for a
different case: a `Pressable` lowered to `div role="button"`, where Hozo has
synthesized a button and therefore must synthesize its Enter and Space
behaviour too.

## When to revisit

Revisit only if Hozo introduces an explicit command-with-URL-fallback API.
That API would need a name that expresses the command, full button keyboard
activation, and tests showing that ordinary destination primitives remain
links. A router implementation changing does not alter this decision; client
routing is still navigation.
