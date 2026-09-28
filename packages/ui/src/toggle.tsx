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
  "flex flex-row items-start gap-3 text-left text-sm text-hozo-text rounded-hozo-control px-2 py-1.5 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed before:content-[''] before:mt-0.5 before:size-4 before:shrink-0 before:rounded before:border-2 before:border-hozo-border-strong before:bg-hozo-surface data-[hozo-state=checked]:before:border-hozo-accent data-[hozo-state=checked]:before:bg-hozo-accent data-[hozo-state=mixed]:before:border-hozo-accent data-[hozo-state=mixed]:before:bg-hozo-accent-subtle disabled:before:border-hozo-border"

const track =
  "flex flex-row items-start gap-3 text-left text-sm text-hozo-text rounded-hozo-control px-2 py-1.5 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed before:content-[''] before:mt-0.5 before:h-4 before:w-7 before:shrink-0 before:rounded-full before:bg-hozo-border-strong before:transition-colors after:content-[''] after:mt-1 after:-ml-6 after:size-2 after:rounded-full after:bg-hozo-surface after:transition-transform data-[hozo-state=checked]:before:bg-hozo-accent data-[hozo-state=checked]:after:translate-x-3"

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
