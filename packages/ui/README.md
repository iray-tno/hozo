# @hozo/ui

A styled component library for Hozo, **shipped as source**. Your own Hozo build compiles it, against your own theme.

```tsx
// your CSS entry
@import "tailwindcss";
@import "@hozo/ui/theme.css";
```

```tsx
import { Button } from '@hozo/ui'

<Button tone="accent" onPress={save}>Save</Button>
```

There is no prebuilt stylesheet to import and nothing to override. The TSX in `node_modules` goes through the same compiler your own components do, so its classes resolve against **your** `@theme` and its CSS lands in your build's output.

## What it adds, and what it does not

It composes and it styles. That is all, and it is a rule rather than a description: anything needing a new role, a new keyboard contract or a new state machine goes into `@hozo/patterns` or `@hozo/form` first, with its own Verification Matrix, and this package then wears it.

A styled layer that implements behaviour becomes a second implementation of the same widget — and then the one people actually use is not the one the accessibility work covers. `Button` here is the `Button` primitive with class names on it, which is why it still turns into a `Link` when you give it an `href`.

## Theming

Every colour, radius and shadow is a token in `theme.css`, and **no component writes a palette name or a literal**. Redefine a token and everything that uses it moves:

```css
@import "@hozo/ui/theme.css";

@theme {
  --color-hozo-accent: var(--color-emerald-600);
  --color-hozo-accent-hover: var(--color-emerald-700);
  --radius-hozo-control: var(--radius-full);
}
```

The tokens are custom properties rather than a JavaScript object, so they are the same Theme IR a future StyleX frontend would read rather than a second copy of it (see [#156](https://github.com/iray-tno/hozo/issues/156)).

Their values are literals rather than `var(--color-slate-600)` references, which would read better and be dropped: `/tailwind` converts each `--color-*` it finds and leaves out what will not convert, and a `var()` chain is not a colour to that converter. The palette entry each token came from is in a comment beside it.

The palette was not designed. It was counted: `examples/storybook-demo` had grown a consistent look by hand, and the tokens are its most-used values promoted — `text-slate-900` in 120 places, `border-slate-200` in 100, `indigo-600` as the accent in 27. `theme.css` records which is which.

One thing the inventory found that this package fixes by construction: the demo had a focus ring on four controls and nothing on most of the rest. Here the ring is part of the only class list an interactive component can have.

## Class names are written out on purpose

Every component's class list is a complete literal chosen by a `switch`, not assembled at runtime. Two tools have to read them and neither runs the code — Tailwind's scanner, to emit the CSS, and Hozo's compiler, which resolves a `className` it can read statically and falls back to the project-wide candidate sheet for one it cannot. A library whose own classes took the fallback path would be arguing against itself.

Consumers need `node_modules/@hozo/ui/src` inside their Tailwind content globs for the same reason.

## `Field` is the one with substance in it

`Button`, `Card` and `Stack` are class names. `Field` is wiring:

```tsx
<Field label="Email" description="We never share it." error={problem} required>
  {(control) => <input type="email" {...control} />}
</Field>
```

Four elements have to agree on four ids between them — a `<label for>`, an `aria-describedby` naming both the description and the error, an `aria-invalid` that agrees with whether there is one, and an `aria-required` that the asterisk cannot carry. Every one of those is something an application gets right on the form it is thinking about and wrong on the other six.

A render prop rather than `<Field><input /></Field>`, because the control is the caller's and stays the caller's. Cloning the child to add props works until somebody wraps their input in a div.

Two decisions it makes for you, both written down in the source: the error comes **first** in `aria-describedby`, because somebody who has just been told their input is wrong wants to know why before being told the rules again; and the error carries `role="alert"`, so a field that mounts with an error already on it announces — right for a form that came back from a server, noisy for one that restores a draft.

## What is here

| | |
|---|---|
| `Button` | four tones, two sizes, and a link when given an `href` |
| `Input` | one line or many; styled by `aria-invalid` rather than by a prop |
| `Field` | the wiring above |
| `Checkbox`, `Switch` | `@hozo/patterns` wearing a box and a track |
| `Slider` | a rail, a fill and a 24px thumb, either orientation |
| `Accordion` | rows in a card, with a chevron drawn from the trigger's state |
| `Tabs` | an underline that moves with `aria-selected`, either orientation |
| `Dialog` | a panel and a `::backdrop` scrim, on a real `<dialog>` |
| `Tooltip` | an inverse bubble, positioned by the pattern |
| `Card`, `Stack` | a surface and a flex box |
| `Badge`, `Alert` | a word with a colour, and a sentence with a role |

Four of those make a decision worth knowing about.

`Input` shows its error state from `aria-invalid:border-hozo-danger` rather than an `invalid` prop. A `Field` already puts that attribute on its control, so the two agree by construction — an `invalid` prop would be a second source of truth, and a disagreement between them is a control that looks fine and announces itself as wrong.

`Alert` is silent by default. `live="polite"` makes it a `status` and `live="assertive"` makes it an `alert`; without either it is a box on the page. An alert rendered *with* the page announces on load, which is right for "your session expired" and wrong for a notice that is there every visit.

`Checkbox` and `Switch` draw their box and track with `::before` and `::after`, reading `data-hozo-state` — so neither is ever told which state it is in. Passing the application's own state back in to draw it is the thing that attribute exists to prevent. `Accordion`'s chevron is the same arrangement: two borders rotated, turned by `data-[hozo-state=open]`, and invisible to a reader because a pseudo-element is not in the accessibility tree and `aria-expanded` already says it.

`Dialog` adds no close button, and that is the rule working rather than an omission. A dismiss control needs a name, a place in the reading order, and a decision about whether focus reaches it first or last — all of which is `@hozo/patterns`' business. Put a `Button` in the children; Escape already works without one. The scrim is the element's own `::backdrop`, so there is no overlay div to reach and no z-index to lose an argument with.

`Slider` is the one component here that takes no class list for its inner parts, and the reason is worth knowing: the pattern positions the thumb by writing `inset-inline-start: 40%` on it as an inline style, and an inline inset does nothing to an element that is not positioned. A caller who replaced the thumb's classes would not be restyling a slider but breaking one, silently — it still renders, takes focus and announces the right value, and sits at the start of the track forever. `className` reaches the track, which is where a width or a height belongs.

## Dark mode, which no component mentions

Every colour token has a `--dark` twin in `theme.css`, and that is the whole of it. `bg-hozo-surface` emits its light rule and a `prefers-color-scheme: dark` one on the Web, and a second `StyleSheet` entry behind `__hozoDark` on React Native. **Not one class list in this package says `dark:`.**

Which is what Tailwind and StyleX both do — a token holds both values and the component holds neither. It took two compiler changes to be able to, because Hozo resolves a token into the rule where Tailwind emits `var()`, and redefining a variable nothing reads does nothing.

Re-theming still means redefining one line, and now there are two of them:

```css
@theme {
  --color-hozo-accent: var(--color-emerald-600);
  --color-hozo-accent--dark: var(--color-emerald-400);
}
```

The dark values are not the light ones inverted. The accent goes *up* the scale — `indigo-600` to `indigo-400` — because a 600 on a dark surface is too dim to read, and `on-accent` flips from white to `slate-950` for the same reason. Every pair clears 4.5:1 on the surface it sits on, which is the rule the light half already followed.

One limitation, inherited rather than introduced: a class resolved at *runtime* on React Native carries no conditions at all — that path has never supported `dark:` either — so a paired token reaches it as its light value. A statically written `className`, which is every component here, is unaffected.

## Status

Early. The rest is tracked in [#638](https://github.com/iray-tno/hozo/issues/638), which also carries the open questions — dark mode strategy, and where `examples/storybook-demo` ends and this package begins.

<!-- generated: package-footer -->

---

Part of [Hozo](https://iray-tno.github.io/hozo/), a Rust-powered universal UI compiler and accessibility-first layer for React Native. Most applications install [`@hozo/core`](https://www.npmjs.com/package/@hozo/core) and one build integration; see [Getting started](https://github.com/iray-tno/hozo#getting-started). Source and issues: [github.com/iray-tno/hozo](https://github.com/iray-tno/hozo).

<!-- /generated: package-footer -->
