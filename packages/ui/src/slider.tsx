/**
 * A slider with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and was verified where it lives: the pointer
 * capture that keeps a drag alive past the end of the track, the keys, the
 * arithmetic shared with the Native half. This file draws a rail, a fill and
 * a thumb.
 *
 * ## The one component here that has to know how the pattern positions things
 *
 * Every other component in this package could be given any class list at all.
 * This one cannot: the pattern moves the thumb by writing
 * `insetInlineStart: 40%` on it as an inline style, and an inline inset does
 * nothing to an element that is not positioned. So `absolute` on the thumb and
 * `relative` on the track are not a look, they are the contract, and
 * `slider.test.ts` checks them rather than trusting this comment.
 *
 * That is also why `thumbClassName` and `fillClassName` are not accepted. A
 * caller who replaced the thumb's list would not be restyling a slider, they
 * would be breaking one, and silently -- it renders, it takes focus, it
 * announces the right value, and it sits at the start of the track forever.
 * `className` still reaches the track, which is where a caller wants it: a
 * width, a margin, a vertical slider's height.
 *
 * ## Centred with margins rather than a transform
 *
 * `-ms-3` is half the thumb, taken off its inline start, and `-ms-` is
 * logical: it is `margin-right` under `dir="rtl"`, which is the direction the
 * pattern's own arithmetic already flips for. A `-translate-x-1/2` would have
 * centred it in one direction and pushed it a whole thumb's width off in the
 * other -- and the bug only appears in a locale nobody demoes.
 *
 * ## Disabled is asked of two different elements
 *
 * `aria-disabled:` on the thumb and `disabled:` on the track, because that is
 * where the pattern puts each: the thumb carries `aria-disabled` for a reader,
 * and the track carries `data-hozo-disabled`, which is what Hozo's `disabled:`
 * variant compiles to. Neither is a prop of ours, so there is no second source
 * of truth to disagree with the first.
 *
 * ## 24px, which is a rule rather than a taste
 *
 * The thumb is `size-6` and the track is as tall, because WCAG 2.5.8 asks for
 * 24 by 24 and a slider is the control that most invites a 12px dot. #636 is
 * the same finding about a one-glyph button. The rail is 6px and drawn as
 * `::before`, so the thing a finger has to hit is the full 24 rather than the
 * part that looks like a slider.
 */

import { Slider as SliderPattern, type SliderProps } from '@hozo/patterns'

/**
 * The pattern's props, less the two class lists that are load-bearing.
 *
 * `style` and friends are not mentioned: they are the Native half's and this
 * package has no opinion about them.
 */
export type HozoSliderProps = Omit<SliderProps, 'thumbClassName' | 'fillClassName'>

/**
 * A track, a fill and a thumb, for each orientation.
 *
 * Written out in full and chosen by a branch, like every other list in this
 * package -- Tailwind's scanner and Hozo's compiler both have to read them
 * without running the code.
 */
const HORIZONTAL = {
  track:
    "relative h-6 w-full touch-none select-none cursor-pointer disabled:cursor-not-allowed before:content-[''] before:absolute before:inset-x-0 before:inset-y-0 before:my-auto before:h-1.5 before:rounded-full before:bg-hozo-border",
  fill: 'absolute inset-y-0 my-auto h-1.5 start-0 rounded-full bg-hozo-accent',
  thumb:
    'absolute inset-y-0 my-auto -ms-3 size-6 rounded-full border-2 border-hozo-accent bg-hozo-surface shadow-hozo-surface cursor-grab hover:border-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-disabled:cursor-not-allowed aria-disabled:border-hozo-border-strong aria-disabled:bg-hozo-surface-raised',
} as const

/**
 * The vertical set, which the pattern drives from `bottom` rather than
 * `insetInlineStart` -- so the thumb is centred the other way round, and a
 * height has to come from somewhere. `h-40` is a default and not a decision;
 * pass `className` to say otherwise.
 */
const VERTICAL = {
  track:
    "relative h-40 w-6 touch-none select-none cursor-pointer disabled:cursor-not-allowed before:content-[''] before:absolute before:inset-y-0 before:inset-x-0 before:mx-auto before:w-1.5 before:rounded-full before:bg-hozo-border",
  fill: 'absolute inset-x-0 mx-auto w-1.5 bottom-0 rounded-full bg-hozo-accent',
  thumb:
    'absolute inset-x-0 mx-auto -mb-3 size-6 rounded-full border-2 border-hozo-accent bg-hozo-surface shadow-hozo-surface cursor-grab hover:border-hozo-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus aria-disabled:cursor-not-allowed aria-disabled:border-hozo-border-strong aria-disabled:bg-hozo-surface-raised',
} as const

export function HozoSlider({ className, orientation, ...rest }: HozoSliderProps) {
  const own = orientation === 'vertical' ? VERTICAL : HORIZONTAL
  return (
    <SliderPattern
      {...rest}
      orientation={orientation}
      className={className ? `${own.track} ${className}` : own.track}
      fillClassName={own.fill}
      thumbClassName={own.thumb}
    />
  )
}

export { HozoSlider as Slider, type HozoSliderProps as SliderProps }
