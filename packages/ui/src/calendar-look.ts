/**
 * The class lists a month grid needs, in one place because five components
 * wear the same grid.
 *
 * `Calendar`, `DatePicker`, `DateRangePicker` and `DateTimePicker` all pass
 * these straight through to `@hozo/form`'s `Calendar`, which is one component
 * receiving one set of props. Sharing them here is not the mistake `Menu`
 * avoids: there, two *different* elements happened to want the same list, and a
 * shared constant would have hidden that a `disabled:` added to it works on one
 * and not the other. Here it is literally the same element.
 *
 * Complete literals still, for the reason `button.tsx` gives: Tailwind's
 * scanner and Hozo's compiler both read class names without running the code.
 *
 * ## The two traps this file exists to close
 *
 * **The month buttons.** `@hozo/form`'s own README names it: a `<button>`
 * holding `‹` and nothing else is about four pixels wide under Preflight --
 * measured there, not guessed -- and a pointer cannot hit it. WCAG 2.5.8 asks
 * for 24 by 24; `size-9` is 36. #636 is the same finding, and #638 §6 puts
 * closing it here rather than in every application.
 *
 * **The day cells.** A `<td>` sized by its content is about 16px wide for a
 * single digit. `min-w-9` with `p-2` keeps every cell at least 36 by 36, so
 * the first of the month is as easy to hit as the twenty-eighth.
 */

/**
 * The day cell, in two versions, because `aria-selected` means different
 * things in the two modes.
 *
 * In single mode it is the one chosen day. In range mode `@hozo/form` sets it
 * on **every** day between the ends -- it is the only attribute ARIA gives for
 * that, and the ends are named in their labels instead. So a list that filled
 * `aria-selected` solid would paint a range as one block and leave the ends
 * indistinguishable from the middle.
 *
 * The range list therefore draws from the data attributes, which say which
 * part of the range a day is: `data-hozo-range-start` and `-end` for the caps,
 * `data-hozo-in-range` for the middle, and none of the three in single mode
 * (`dayState` only sets them when `ranged`, which its comment says is exactly
 * so a single grid's chosen day "does not pick up an end cap in someone's
 * CSS"). Those three carried no CSS at all until #679, because the scanner cut
 * a class name at its `=`.
 */
const DAY_BASE =
  'cursor-pointer select-none text-center align-middle text-sm leading-6 text-hozo-text p-2 min-w-9 rounded-hozo-control hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus data-[hozo-outside]:text-hozo-text-subtle data-[hozo-disabled]:text-hozo-text-subtle data-[hozo-disabled]:cursor-not-allowed data-[hozo-disabled]:hover:bg-transparent'

export const CALENDAR = {
  /** The `role="group"` around the header and the grid. */
  group:
    'inline-flex flex-col gap-2 rounded-hozo-surface border border-hozo-border bg-hozo-surface p-4',
  /** The month row: two buttons and the month's name between them. */
  header: 'flex flex-row items-center justify-between gap-2 text-sm font-semibold text-hozo-text',
  /** Both month buttons, 36px square. See the note above. */
  monthButton:
    'inline-flex size-9 items-center justify-center rounded-hozo-control text-hozo-text-muted cursor-pointer hover:bg-hozo-surface-hover hover:text-hozo-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent',
  /** The `<table>`, which is the element that wants these. */
  grid: 'w-full border-collapse text-sm',
  day: {
    single: `${DAY_BASE} aria-selected:bg-hozo-accent aria-selected:text-hozo-on-accent aria-selected:font-semibold`,
    range: `${DAY_BASE} data-[hozo-in-range]:bg-hozo-accent-subtle data-[hozo-in-range]:text-hozo-accent-text data-[hozo-range-start]:bg-hozo-accent data-[hozo-range-start]:text-hozo-on-accent data-[hozo-range-start]:font-semibold data-[hozo-range-end]:bg-hozo-accent data-[hozo-range-end]:text-hozo-on-accent data-[hozo-range-end]:font-semibold`,
  },
  /**
   * A picker's trigger and the panel its grid sits in.
   *
   * The trigger repeats the neutral `Button`'s list because it is a plain
   * `<button>` that `@hozo/form` renders, not the primitive -- the distinction
   * `menu.tsx` sets out at length. The panel carries no z-index: the floating
   * positioner already has one.
   */
  trigger:
    'inline-flex items-center justify-start gap-2 px-4 py-3 text-sm font-semibold rounded-hozo-control transition-colors cursor-pointer bg-hozo-surface text-hozo-text-body border border-hozo-border-strong hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent',
  panel:
    'rounded-hozo-panel border border-hozo-border bg-hozo-surface p-2 shadow-hozo-surface text-hozo-text',
} as const

/**
 * Today's marker, which cannot be a variant.
 *
 * `@hozo/form` marks today with `aria-current="date"`, and that is not a
 * boolean: Tailwind spells it `aria-[current=date]:` and Hozo implements only
 * the boolean states, so the class would be reported rather than compiled
 * (which it now is -- the diagnostic learned the bracket form in #679). A
 * `data-hozo-today` attribute would be the other way, and it is `@hozo/form`'s
 * to add, not this package's.
 *
 * So the marker is drawn where the information already is: `renderDay` is
 * handed `today` by the component that knows. An underline rather than a ring,
 * so it reads on a cell that is also selected -- where a ring would be the
 * selected fill's own edge.
 *
 * It is a `::after`, so a reader hears nothing extra: `aria-current="date"`
 * already says it, in the one channel that carries it.
 *
 * Drawn as a border rather than as a 2px box, because 2px is not on this
 * package's grid of 4 and a hairline is ink rather than layout -- the
 * exemption `grid.test.ts` spells out. A zero-height element with a bottom
 * border is a 2px line whose height is 0.
 */
export const TODAY =
  "relative after:content-[''] after:absolute after:inset-x-2 after:bottom-0 after:h-0 after:border-b-2 after:border-hozo-accent"
