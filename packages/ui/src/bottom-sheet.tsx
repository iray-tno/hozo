/**
 * A bottom sheet with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs: `Portal + FocusScope + DismissableLayer` and a
 * gesture, with the arithmetic in `sheet-rules.ts` so both platforms land a
 * flick on the same detent. This file places it against the bottom edge and
 * draws a grabber.
 *
 * ## `@hozo/patterns` does not know about the breakpoint, and should not
 *
 * #142 asks for the Web behaviour to be responsive: a sheet on a phone and a
 * centred dialog on a desktop. That is a look, so it is four variants in this
 * class list rather than a media query in a state machine -- `sm:items-center`
 * moves the box to the middle, `sm:max-w-md` and the radius on all four corners
 * finish the job, and the compiler resolves the whole thing at build time
 * because the names are literal.
 *
 * Worth stating what that means for the drag: it survives the breakpoint. A
 * centred panel dragged downward still dismisses, which is what a pointer user
 * would expect of something they just grabbed, and nothing about the gesture
 * needed to know which side of 640px it was on.
 *
 * ## The sheet has no close button, for the reason `Dialog` has none
 *
 * A dismiss control needs a name and a place in the reading order, and that is
 * `@hozo/patterns`' business (#638 §2). Escape works, the scrim works, and the
 * drag works; put a `Button` in the children when the design wants one visible.
 */

import { BottomSheet as BottomSheetPattern, type BottomSheetProps } from '@hozo/patterns'

export type HozoBottomSheetProps = Omit<
  BottomSheetProps,
  'className' | 'scrimClassName' | 'sheetClassName' | 'handleClassName'
>

const root = 'fixed inset-0 z-50 flex items-end justify-center sm:items-center'

/** Dark in both schemes, because a scrim is not a surface seen from behind. */
const scrim =
  'absolute inset-0 bg-hozo-scrim/50 transition-opacity duration-200 ease-out starting:opacity-0 data-[state=closed]:opacity-0'

/**
 * `max-h-[85vh]` with `overflow-y-auto` for the reason `Dialog` has them: the
 * one thing a modal cannot do is put content where nobody can scroll to it, and
 * the part that goes missing is the bottom, where the buttons are.
 *
 * The radius is on the top corners only until `sm:`, where the panel stops
 * touching the bottom edge and wants all four.
 */
const sheet =
  'relative flex w-full max-w-lg flex-col gap-4 max-h-[85vh] overflow-y-auto rounded-t-hozo-panel border border-hozo-border bg-hozo-surface p-6 text-hozo-text-body shadow-hozo-surface transition duration-200 ease-out starting:opacity-0 data-[state=closed]:opacity-0 motion-safe:starting:translate-y-full motion-safe:data-[state=closed]:translate-y-full data-[hozo-dragging=true]:transition-none sm:max-w-md sm:rounded-hozo-panel'

/**
 * A 24px box holding a 4px bar.
 *
 * The bar is what a person sees and 4px is not a target, so the box around it is
 * `h-6`: the smallest thing WCAG 2.5.8 accepts, and on the 4px grid. It is
 * centred by the panel rather than by itself, so the same list works whether it
 * is a `<button>` or the decoration it becomes with a single detent.
 */
const handle =
  'flex h-6 w-12 shrink-0 items-center justify-center self-center rounded-full cursor-grab focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus before:block before:h-1 before:w-8 before:rounded-full before:bg-hozo-border-strong'

export function HozoBottomSheet(props: HozoBottomSheetProps) {
  return (
    <BottomSheetPattern
      {...props}
      className={root}
      scrimClassName={scrim}
      sheetClassName={sheet}
      handleClassName={handle}
    />
  )
}

export { HozoBottomSheet as BottomSheet, type HozoBottomSheetProps as BottomSheetProps }
