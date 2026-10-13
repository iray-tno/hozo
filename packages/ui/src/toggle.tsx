/**
 * A checkbox and a switch with a look, wearing `@hozo/patterns`.
 *
 * The behaviour is theirs and was verified where it lives: three states on
 * the checkbox and two on the switch, the roles a reader distinguishes, the
 * real `disabled` attribute. This file draws a box and a track.
 *
 * ## Real decorative slots, with state still owned by the pattern
 *
 * Pseudo-elements had no Native node to land on (#896). The pattern now
 * creates a hidden span/View for the box or track, and one for its mark.
 * It asks this pure look callback using the very state it announces; the
 * styled layer never copies controlled or uncontrolled state into a hook.
 * This works without browser-only selectors and without a second state prop
 * an application has to remember to update.
 *
 * The mixed look is on the checkbox and not the switch, for the
 * same reason the pattern has three states and two: ARIA gives `role="switch"`
 * no mixed value, so a switch that drew one would be drawing something a
 * reader can never announce.
 *
 * ## Positioned, after a version that was not
 *
 * The first version of this file made both decorations *flex children* of
 * the row: `::before`, then the label, then `::after`. Which put the switch's
 * knob after the label, and `-ml-6` pulled it 24px back -- onto the text,
 * about 96px from the track it was meant to sit in. Nothing caught it, for the
 * reason the chevron was wrong for two releases: no check in this repository
 * looks at a shape, so a pseudo-element's position is reviewed by reading the
 * arithmetic or not at all.
 *
 * So the arithmetic is written down. The row is `relative`, the outline is
 * `absolute`, and the knob's inset is relative to its track. The historic
 * root-relative coordinates below are still the resulting coordinates:
 *
 * | | x | y | size |
 * |---|---|---|---|
 * | box, track | `start-2` (8) | `top-3` (12) | 16, or 28x16 |
 * | knob | track + `start-1` (12) | track + `top-1` (16) | 8 |
 * | knob, checked | track + `start-4` (24) | | |
 *
 * `leading-6` is what makes those land: a 24px line box with `py-2` puts the
 * first line's centre at 20px, which is where a 16px box at `top-3` is
 * centred. With `text-sm`'s own 20px line box the offset would have been 10px,
 * and a grid of 4 cannot express it -- so the line height is on the grid too,
 * and the control aligns to the *first line* rather than to the middle of a
 * label that wrapped.
 *
 * The knob sits 4px inside a 28px track at either end: 12 to 20 unchecked,
 * 24 to 32 checked, against a track running 8 to 36. Logical insets, rather
 * than a physical translate-x, also keep the same contract in RTL.
 */

import {
  Checkbox as CheckboxPattern,
  type CheckboxProps,
  type CheckedState,
  Switch as SwitchPattern,
  type SwitchProps,
} from '@hozo/patterns'

export type HozoCheckboxProps = Omit<CheckboxProps, 'indicator'>
export type HozoSwitchProps = Omit<SwitchProps, 'indicator'>

const box =
  'relative block w-full text-left text-sm leading-6 text-hozo-text rounded-hozo-control ps-9 pe-3 py-2 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed'

const track =
  'relative block w-full text-left text-sm leading-6 text-hozo-text rounded-hozo-control ps-11 pe-3 py-2 cursor-pointer hover:bg-hozo-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hozo-focus disabled:text-hozo-text-subtle disabled:hover:bg-transparent disabled:cursor-not-allowed'

// Each branch is a complete literal: both candidate scanners must see every
// look without executing this callback. The check/dash does not rely on colour
// alone, and the disabled version still distinguishes all three states.
export function checkboxIndicator({
  checked,
  disabled,
}: {
  checked: CheckedState
  disabled: boolean
}) {
  const className = disabled
    ? 'absolute start-2 top-3 flex size-4 items-center justify-center rounded border-2 border-hozo-border bg-hozo-surface'
    : checked === 'mixed'
      ? 'absolute start-2 top-3 flex size-4 items-center justify-center rounded border-2 border-hozo-accent bg-hozo-accent-subtle'
      : checked
        ? 'absolute start-2 top-3 flex size-4 items-center justify-center rounded border-2 border-hozo-accent bg-hozo-accent'
        : 'absolute start-2 top-3 flex size-4 items-center justify-center rounded border-2 border-hozo-border-strong bg-hozo-surface'
  const markClassName =
    checked === 'mixed'
      ? disabled
        ? 'h-1 w-2 bg-hozo-text-subtle'
        : 'h-1 w-2 bg-hozo-accent-text'
      : checked
        ? disabled
          ? 'h-2 w-1 rotate-45 border-b-2 border-r-2 border-hozo-text-subtle'
          : 'h-2 w-1 rotate-45 border-b-2 border-r-2 border-hozo-on-accent'
        : undefined
  return { className, markClassName }
}

export function switchIndicator({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  const className = disabled
    ? 'absolute start-2 top-3 h-4 w-7 rounded-full bg-hozo-border'
    : checked
      ? 'absolute start-2 top-3 h-4 w-7 rounded-full bg-hozo-accent'
      : 'absolute start-2 top-3 h-4 w-7 rounded-full bg-hozo-border-strong'
  const markClassName = checked
    ? disabled
      ? 'absolute start-4 top-1 size-2 rounded-full bg-hozo-text-subtle'
      : 'absolute start-4 top-1 size-2 rounded-full bg-hozo-surface'
    : disabled
      ? 'absolute start-1 top-1 size-2 rounded-full bg-hozo-text-subtle'
      : 'absolute start-1 top-1 size-2 rounded-full bg-hozo-surface'
  return { className, markClassName }
}

export function HozoCheckbox({ className, ...rest }: HozoCheckboxProps) {
  return (
    <CheckboxPattern
      {...rest}
      indicator={checkboxIndicator}
      className={className ? `${box} ${className}` : box}
    />
  )
}

export function HozoSwitch({ className, ...rest }: HozoSwitchProps) {
  return (
    <SwitchPattern
      {...rest}
      indicator={switchIndicator}
      className={className ? `${track} ${className}` : track}
    />
  )
}

export {
  HozoCheckbox as Checkbox,
  type HozoCheckboxProps as CheckboxProps,
  HozoSwitch as Switch,
  type HozoSwitchProps as SwitchProps,
}
