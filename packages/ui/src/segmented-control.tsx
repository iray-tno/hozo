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
 * ## Why the corners and the dividers are not variants per segment
 *
 * One `optionClassName` goes to every option, so a first and last segment cannot
 * be given different lists. `first:`/`last:` would do it -- `accordion.tsx` uses
 * them -- but the container is simpler and has no edge cases: `overflow-hidden`
 * with the radius clips the end segments' corners, and `gap-px` over the
 * container's own border colour draws the dividers as the gaps between segments.
 * No pseudo-elements, and a strip of one segment still looks right.
 */

import { RadioGroup as RadioGroupPattern, type RadioGroupProps } from '@hozo/patterns'

export type HozoSegmentedControlProps<T> = Omit<
  RadioGroupProps<T>,
  'className' | 'optionClassName' | 'orientation'
>
export type { RadioOption as HozoSegmentedOption } from '@hozo/patterns'

/**
 * `inline-flex` so the strip is as wide as its segments rather than as wide as
 * the form, and `p-px` so the border colour shows all the way round rather than
 * only between the segments.
 */
const strip =
  'inline-flex flex-row gap-px overflow-hidden rounded-hozo-control border border-hozo-border-strong bg-hozo-border-strong p-px'

/**
 * `flex-1` with `min-w-0`, so three segments share the strip evenly and a long
 * label shrinks rather than pushing the strip past its container.
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
  'min-w-0 flex-1 cursor-pointer px-4 py-2 text-center text-sm leading-6 whitespace-nowrap bg-hozo-surface text-hozo-text-body hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-hozo-focus aria-checked:bg-hozo-accent aria-checked:text-hozo-on-accent aria-checked:font-semibold aria-disabled:text-hozo-text-subtle aria-disabled:cursor-not-allowed aria-disabled:hover:bg-hozo-surface'

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
