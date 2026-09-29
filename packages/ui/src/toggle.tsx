/**
 * A checkbox and a switch with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and was verified where it lives: three states on
 * the checkbox and two on the switch, the roles a reader distinguishes, the
 * real `disabled` attribute. This file draws a box and a track.
 *
 * ## Drawn with pseudo-elements, which is the no-CSS promise working
 *
 * The pattern renders its children and nothing else -- there is no box in the
 * markup to style. So the box is `::before` and the switch's knob is
 * `::after`, and both read their state off `data-hozo-state`, which the
 * pattern puts on every render. Neither component here is told which state it
 * is in, and neither has to be: passing the application's own state back in
 * to draw it is the thing that attribute exists to prevent.
 *
 * `data-[hozo-state=mixed]` is on the checkbox and not the switch, for the
 * same reason the pattern has three states and two: ARIA gives `role="switch"`
 * no mixed value, so a switch that drew one would be drawing something a
 * reader can never announce.
 *
 * ## Positioned, after a version that was not
 *
 * The first version of this file made both pseudo-elements *flex children* of
 * the row: `::before`, then the label, then `::after`. Which put the switch's
 * knob after the label, and `-ml-6` pulled it 24px back -- onto the text,
 * about 96px from the track it was meant to sit in. Nothing caught it, for the
 * reason the chevron was wrong for two releases: no check in this repository
 * looks at a shape, so a pseudo-element's position is reviewed by reading the
 * arithmetic or not at all.
 *
 * So the arithmetic is written down. The row is `relative`, both pieces are
 * `absolute`, and every number below is a multiple of 4:
 *
 * | | x | y | size |
 * |---|---|---|---|
 * | box, track | `start-2` (8) | `top-3` (12) | 16, or 28x16 |
 * | knob | `start-3` (12) | `top-4` (16) | 8 |
 * | knob, checked | +`translate-x-3` (12) | | |
 *
 * `leading-6` is what makes those land: a 24px line box with `py-2` puts the
 * first line's centre at 20px, which is where a 16px box at `top-3` is
 * centred. With `text-sm`'s own 20px line box the offset would have been 10px,
 * and a grid of 4 cannot express it -- so the line height is on the grid too,
 * and the control aligns to the *first line* rather than to the middle of a
 * label that wrapped.
 *
 * The knob sits 4px inside a 28px track at either end: 12 to 20 unchecked,
 * 24 to 32 checked, against a track running 8 to 36.
 */

import {
  Checkbox as CheckboxPattern,
  type CheckboxProps,
  Switch as SwitchPattern,
  type SwitchProps,
} from '@hozo/patterns'

export type HozoCheckboxProps = CheckboxProps
export type HozoSwitchProps = SwitchProps

const box =
  "relative block w-full text-left text-sm leading-6 text-hozo-text rounded-hozo-control ps-9 pe-3 py-2 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed before:content-[''] before:absolute before:start-2 before:top-3 before:size-4 before:rounded before:border-2 before:border-hozo-border-strong before:bg-hozo-surface data-[hozo-state=checked]:before:border-hozo-accent data-[hozo-state=checked]:before:bg-hozo-accent data-[hozo-state=mixed]:before:border-hozo-accent data-[hozo-state=mixed]:before:bg-hozo-accent-subtle disabled:before:border-hozo-border"

const track =
  "relative block w-full text-left text-sm leading-6 text-hozo-text rounded-hozo-control ps-11 pe-3 py-2 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed before:content-[''] before:absolute before:start-2 before:top-3 before:h-4 before:w-7 before:rounded-full before:bg-hozo-border-strong before:transition-colors after:content-[''] after:absolute after:start-3 after:top-4 after:size-2 after:rounded-full after:bg-hozo-surface after:transition-transform data-[hozo-state=checked]:before:bg-hozo-accent data-[hozo-state=checked]:after:translate-x-3"

export function HozoCheckbox({ className, ...rest }: HozoCheckboxProps) {
  return <CheckboxPattern {...rest} className={className ? `${box} ${className}` : box} />
}

export function HozoSwitch({ className, ...rest }: HozoSwitchProps) {
  return <SwitchPattern {...rest} className={className ? `${track} ${className}` : track} />
}

export {
  HozoCheckbox as Checkbox,
  type HozoCheckboxProps as CheckboxProps,
  HozoSwitch as Switch,
  type HozoSwitchProps as SwitchProps,
}
