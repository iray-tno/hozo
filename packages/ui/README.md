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
| `Popover` | a panel on a surface, non-modal, closing when focus leaves |
| `BottomSheet` | a modal sheet against the bottom edge, centred from `sm:`, with a grabber |
| `RadioGroup` | a ring and a dot, drawn from `aria-checked` |
| `Listbox` | a scrolling box whose chosen row changes weight as well as colour |
| `Menu` | a neutral trigger and a floating panel |
| `Toolbar` | a bar; the controls in it are yours |
| `Combobox` | `Input`'s field and a filtered list whose highlight is only a tint |
| `Tree` | indentation per depth and a chevron nobody hears |
| `Calendar` | a month grid whose cells and month buttons are 36px |
| `DatePicker`, `DateRangePicker` | that grid in a panel, behind a trigger |
| `TimePicker` | two spinbuttons with 24px arrows inside the field |
| `DateTimePicker` | the grid, that clock, and a Done that only closes |
| `Card`, `Stack` | a surface and a flex box |
| `Badge`, `Alert` | a word with a colour, and a sentence with a role |

Four of those make a decision worth knowing about.

`Input` shows its error state from `aria-invalid:border-hozo-danger` rather than an `invalid` prop. A `Field` already puts that attribute on its control, so the two agree by construction — an `invalid` prop would be a second source of truth, and a disagreement between them is a control that looks fine and announces itself as wrong.

`Alert` is silent by default. `live="polite"` makes it a `status` and `live="assertive"` makes it an `alert`; without either it is a box on the page. An alert rendered *with* the page announces on load, which is right for "your session expired" and wrong for a notice that is there every visit.

Everything below that reads a `data-[…=…]` attribute — the checkbox's fill, the switch's track and knob, the accordion's chevron, a range's end caps — emitted **no CSS at all** until [#679](https://github.com/iray-tno/hozo/pull/679): Hozo's candidate scanner ended a class name at its `=`, and an unresolved candidate is skipped without a diagnostic. It was found by measuring computed styles in a browser, because nothing else here looks at one.

`Checkbox` and `Switch` draw their box and track with `::before` and `::after`, reading `data-hozo-state` — so neither is ever told which state it is in. Passing the application's own state back in to draw it is the thing that attribute exists to prevent. `Accordion`'s chevron is the same arrangement: two borders rotated, turned by `data-[hozo-state=open]`, and invisible to a reader because a pseudo-element is not in the accessibility tree and `aria-expanded` already says it.

`Listbox` marks its chosen row with a tint **and** a weight. WCAG 1.4.1 asks that colour not be the only visual means of conveying information, and a pale tint on the selected row is the easiest way to fail it — invisible on a monochrome display, to a colour-blind reader, and in print. axe cannot find this; its contrast rule asks whether text is readable, not whether two rows differ for a reason. So `listbox.test.ts` asserts it, the way `tokens.test.ts` asserts the focus ring.

`RadioGroup` draws a ring and a dot with `::before` and `::after`, both positioned over a row that reserves the space with `ps-9`. The options are `<div role="radio">`, so there is no `:checked` to select and nothing the browser draws for us — `aria-checked:` is the attribute a reader announces and therefore the one the dot hangs off.

`TimePicker` puts its two arrows inside the field's inline end, 24 by 24 each, told apart only by `data-hozo-step` — so before [#679](https://github.com/iray-tno/hozo/pull/679) they were drawn in the same place, one on top of the other, and the demo's own story had been writing `data-[hozo-step=increase]:bottom-1/2` to no effect since the picker shipped. Measured in a browser after the fix: 24×24 at (22, 1) and (22, 23) of a 47×48 field.

Its focus ring is `focus-within:` on the field rather than on the `role="spinbutton"` inside it, because `@hozo/form` puts no class on that element and it is the one that takes focus. The ring is visible and surrounds the control being operated, which satisfies 2.4.7; a `valueClassName` in `@hozo/form` would be the better answer, and it is a prop on someone else's package.

`DateTimePicker` gets its clock through `children`, which is the seam `@hozo/form` provides for it — there is no class-name prop that reaches the time half, deliberately, because [#148](https://github.com/iray-tno/hozo/issues/148) leaves that half to the caller: a spinbutton expresses a continuum and a list expresses a set with holes in it. Pass your own `children` and this gets out of the way.

`Calendar` is where the target-size rule stops being an application's problem. `@hozo/form`'s README warns that a month button holding `‹` is about four pixels wide under a CSS reset — measured there, and warning was all it could do, since that package ships no CSS. A `<td>` holding `1` is about sixteen. Both are 36 here, and `calendar.test.ts` asserts it in pixels.

Its two day-cell class lists differ for a reason worth knowing: in range mode `@hozo/form` puts `aria-selected` on **every** day between the ends, because that is the only attribute ARIA has for "in the range" — the ends say which they are in their accessible names. So the range list ignores `aria-selected` and draws its caps from `data-hozo-range-start` and `-end`, with `-in-range` for the middle. A list that filled `aria-selected` would paint a range as one block with no ends, which looks plausible and cannot tell you where your range starts.

Today is underlined by `renderDay` rather than by a variant, because `aria-current="date"` is not a boolean state and Hozo compiles only those (the class would now be *reported* rather than silently dropped, which is the other half of [#679](https://github.com/iray-tno/hozo/pull/679)). `DatePicker` and `DateRangePicker` wear the same lists from `calendar-look.ts`: a picker whose grid was styled separately from the standalone one is two calendars to keep in step, and the day people notice is the day they stop matching.

`Tree` draws its chevron with `::before` rather than writing one into the label, and the difference is audible. The `Patterns/Tree` story puts a `▾` in the text, and its approved golden records what that costs:

```
treeitem, ▾ crates, expanded, level 1, position 1, not selected
```

The glyph is part of the accessible name, and then `expanded` says the same thing again. A pseudo-element is not in the accessibility tree at all, so this package's tree reads `treeitem, crates, expanded` — seen and never heard. Indentation is a literal class per depth, because `ps-${level * 4}` is a class name nothing emitted CSS for; Tailwind's scanner and Hozo's compiler both read names without running the code.

Which means `Tree` passes its own `renderRow`. Pass yours and you own the row's inside — label, indentation and marker together — which is the honest bargain and why the prop stays in the type.

`Combobox` and `Listbox` both style `aria-selected`, and they must not look the same. In a combobox the attribute is on the option the arrows have moved to, because the chosen value lives in the input; in a listbox it is the answer. So the combobox highlights with a tint and the listbox adds a weight, and `combobox.test.ts` asserts that the tint does not grow a weight. A combobox whose highlighted row looks chosen tells you that arrowing past an option selected it, which is not a style mistake but a lie about state.

`Toolbar` styles nothing inside it, because a toolbar's items come from `items[].render`, which hands each one the `tabIndex`, `ref` and handlers that make the roving focus work. A `Toolbar` that drew its own buttons would be deciding what a toolbar contains, and the pattern deliberately does not.

`Dialog` adds no close button, and that is the rule working rather than an omission. A dismiss control needs a name, a place in the reading order, and a decision about whether focus reaches it first or last — all of which is `@hozo/patterns`' business. Put a `Button` in the children; Escape already works without one. The scrim is the element's own `::backdrop`, so there is no overlay div to reach and no z-index to lose an argument with.

`Slider` is the one component here that takes no class list for its inner parts, and the reason is worth knowing: the pattern positions the thumb by writing `inset-inline-start: 40%` on it as an inline style, and an inline inset does nothing to an element that is not positioned. A caller who replaced the thumb's classes would not be restyling a slider but breaking one, silently — it still renders, takes focus and announces the right value, and sits at the start of the track forever. `className` reaches the track, which is where a width or a height belongs.

## Every length is a multiple of 4px

Tailwind's spacing unit is `0.25rem`, so every integer step — `p-2`, `gap-3`, `size-6` — is already on a grid of 4. What breaks it is the half step, and there were eight of them in here: `py-1.5` is 6px, `gap-0.5` is 2px, `py-2.5` is 10px. None was a decision; they are what "a little tighter" compiles to when nobody is counting. `grid.test.ts` is the counting.

Two things are exempt, both for a reason. `top-1/2` and `translate-x-1/2` are percentages rather than lengths — half of something is not off-grid, 6px is. And `border-2`, `outline-2` and `outline-offset-2` are ink rather than layout: a hairline is 1px whatever the grid says, and a focus ring forced to 4px would be a different ring.

Snapping is not free, and it changed two things worth knowing about. Rows that draw a control against their first line carry `leading-6`, because a 20px line box centres a 16px box at 10px and a grid of 4 cannot write that; with a 24px line box the offset is 12. The line height has to be on the same grid as the padding, or the padding cannot stay on it. And the buttons grew: `py-2.5` gave a 36px control, `py-3` gives 44 — the height Apple's guidance asks for, well past WCAG 2.5.8's 24. The small size is 36. Two sizes, both on the grid, both large enough, which the previous pair was only by accident.

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
