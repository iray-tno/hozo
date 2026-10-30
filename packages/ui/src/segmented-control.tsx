/**
 * A segmented control, which is a radio group and nothing else.
 *
 * #143 lists it as a component to implement. It is not one, and finding that out
 * is the work: `@hozo/patterns`' `RadioGroup` already does every behaviour
 * `SegmentedControl` needs -- `role="radiogroup"` with `role="radio"` children,
 * one tab stop for the whole strip, arrows choosing within it, `aria-orientation`,
 * disabled options skipped rather than stopped on, and the two horizontal arrows
 * mirrored when the document runs right to left. #143's own Web line says so in
 * as many words: "stylized accessible radio button group".
 *
 * So there is no new pattern and no new runtime. This file is a class list, and
 * the catalog entry is satisfied by composition -- which is what #156 means by
 * Layer 3 being proof that the behaviours compose rather than a place to keep
 * adding components.
 *
 * ## It is not `Tabs`, and that is the mistake it exists to prevent
 *
 * The two look identical and mean different things. A tab strip chooses which
 * panel is shown and its chosen tab is `aria-selected`; a segmented control
 * chooses a *value* and its chosen segment is `aria-checked`. A reader told
 * "tab" expects a panel to appear. Reach for `Tabs` when something below changes,
 * and for this when a field is being filled in.
 *
 * ## The API is `RadioGroup`'s, which is not what #143 wrote
 *
 * #143 proposes `values: string[]` with `selectedIndex: number`. This takes
 * `options` and `value`, like `RadioGroup` and `Listbox`, because an index is a
 * position rather than an identity: reorder the array and the selection moves to
 * whatever is now in that slot, silently. The deviation is deliberate and is
 * recorded here rather than in the issue, since being the same as its two
 * neighbours matters more than being the same as a sketch.
 *
 * ## Why every segment is a pill inside a track
 *
 * One `optionClassName` goes to every option, so a first and last segment cannot
 * be given different lists. The strip used to answer that by clipping: square
 * segments, dividers drawn as `gap-px` over the border colour, and
 * `overflow-hidden` with the radius rounding the two ends. It looked unfinished
 * (#1449): the border and the padding of the same colour made a ring twice as
 * thick as a border, and a chosen end segment was a rectangle cut by a curve
 * on one side and square on the other.
 *
 * Now the strip is a sunken track and each segment has its own, smaller radius,
 * so the chosen one is a whole pill wherever it sits, and its corners follow
 * the track's at the distance of the padding. Nothing is clipped, so the focus
 * ring can stand off the segment, as it does on a button, instead of being
 * drawn inward in the same colour as a chosen segment's fill, where it could
 * not be seen. A strip of one segment is a pill in a track.
 */

import { RadioGroup as RadioGroupPattern, type RadioGroupProps } from '@hozo/patterns'

export type HozoSegmentedControlProps<T> = Omit<
  RadioGroupProps<T>,
  'className' | 'optionClassName' | 'orientation'
>
export type { RadioOption as HozoSegmentedOption } from '@hozo/patterns'

/**
 * `inline-flex` so the strip is as wide as its segments rather than as wide as
 * the form. `p-1` is the distance the segments' corners keep from the
 * track's, which is what `rounded-hozo-inset` is sized for.
 */
const strip =
  'inline-flex flex-row gap-1 rounded-hozo-control border border-hozo-border bg-hozo-surface-sunken p-1'

/**
 * `flex-auto` with `min-w-0`: each segment is as wide as its label, any width
 * the strip is given beyond that is shared out, and a long label shrinks rather
 * than pushing the strip past its container.
 *
 * Not `flex-1`, whose zero basis the strip's own width is then summed from. A
 * browser sizes an `inline-flex` box from its items' content anyway; React
 * Native's Yoga sums the zero bases, so a strip with no width of its own came
 * out as wide as the padding and each label showed one letter (#1205).
 *
 * `aria-checked:` draws the chosen one, for the reason `radio.tsx` gives: these
 * are `<div role="radio">` with no `:checked` to select, and the attribute a
 * reader announces is the one worth drawing from -- one fact, read twice, with no
 * prop of ours to disagree with it.
 *
 * `py-2 leading-6` is 40px tall, comfortably past WCAG 2.5.8's 24, and on the 4px
 * grid.
 */
const segment =
  'min-w-0 flex-auto cursor-pointer rounded-hozo-inset px-4 py-2 text-center text-sm leading-6 whitespace-nowrap bg-transparent text-hozo-text-body hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-checked:bg-hozo-accent aria-checked:text-hozo-on-accent aria-checked:font-semibold aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent'

export function HozoSegmentedControl<T>(props: HozoSegmentedControlProps<T>) {
  return (
    <RadioGroupPattern
      {...props}
      // Horizontal is the whole look, so it is not a prop here: a vertical
      // segmented control is a `RadioGroup`, which is the component above.
      orientation="horizontal"
      className={strip}
      optionClassName={segment}
    />
  )
}

export {
  HozoSegmentedControl as SegmentedControl,
  type HozoSegmentedControlProps as SegmentedControlProps,
}
