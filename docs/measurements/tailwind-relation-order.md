# Relations in Tailwind order

Continues #1230 above [corner radii](tailwind-corner-radius-order.md). Policy
**scalar-order-v15**.

## What was wrong

`group-*`, `peer-*`, `in-*` and `has-*` were barriers: their selectors were
never assessed, so an input with one kept its authored order. A relation
usually outweighs an unprefixed class, which hid most of this, but not when it
meets another variant of the same weight: `hover:p-8 group-hover:p-4` let the
group win where Tailwind's later `hover:` does, and `in-focus:p-4 md:p-8` let
the focused ancestor win at every width.

## What changed

Assessment reads the four relation shapes Tailwind writes around one inner
compound, and gives each the inner compound's weight:

| Variant | Tailwind's nested selector | Weight |
| --- | --- | --- |
| `group-hover:` | `&:is(:where(.group):hover *)` | 1 |
| `peer-checked:` | `&:is(:where(.peer):checked ~ *)` | 1 |
| `has-checked:` | `&:has(*:checked)` | 1 |
| `in-focus:` | `:where(*:focus) &` | 0 |

The inner compound is an owner state (`:hover`, `:focus`, `:focus-visible`,
`:active`, `:disabled`, one boolean `[aria-…="true"]`) or one of the element
selectors already assessed (`:first-child`, `[data-state="open"]`, `open`, …).
A hovered relation keeps `hover:`'s `@media (hover: hover)`.

The write side spells the same selector from the IR condition and compares it
as text, as it does for element selectors. Inside a relation an owner state is
part of the selector, not an owner fact of the styled element.

Still unassessed: named groups and peers (`group-hover/item:`), a relation
around a relation, around several conditions, around `dark:`/`ltr:`/`rtl:` or
`:visited`, and the arbitrary `has-[…]:` and `group-[…]:` forms.

Native: the generated candidate map refuses every relation candidate, so
only the static path is ranked; a test fails when the map starts generating
them.

## Verification

- **Chromium, real Tailwind as the oracle**: 20 pairs in both authored orders,
  each read with no state, with the group focused and its child hovered, with
  the peer focused, and while pressing the element; group/peer/child
  attributes and checkboxes are set in the three active scenarios.
  **160 observations, 160 agree.** The legacy output disagreed in 12, all
  where the relation meets a variant of the same weight.
- `relation-order.test.ts`: 11 pairs give identical Web CSS and Native static
  output in both orders; the generated Native map refuses every relation.
- `cargo test -p hozo_ir`: each relation spelling matches its own selector and
  weight; 11 near misses (named group, `:visited`, no `*`, nested relation,
  `peer` without `~`, …) stay unassessed, and six inner conditions are refused.
- Two tests used `group-hover:p-2` as their unassessed example; they now use
  `group-hover/item:p-2`.
- The first browser run measured a stale addon and showed 12 mismatches that
  were simply the old barrier; rebuilding the addon removed them. The
  captured snapshot also showed that Tailwind writes `in-` and `has-` with
  `*` (`:where(*:focus) &`, `&:has(*:checked)`), which the first spelling
  missed.
