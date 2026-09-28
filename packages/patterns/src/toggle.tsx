/**
 * Checkbox and Switch, which are one control with two roles.
 *
 * They are in one file because the interesting thing about them is the
 * difference, and a difference stated once is a difference that cannot drift:
 *
 *   - `checkbox` has three states. `aria-checked="mixed"` is the third, and it
 *     is what a parent checkbox over a partly-chosen list says.
 *   - `switch` has two. ARIA gives `role="switch"` no mixed value, because a
 *     switch is a thing that is on or off and there is no third way to be on.
 *     A reader says "on"/"off" for it and "checked"/"not checked" for the
 *     other, which is the whole reason the two roles exist.
 *
 * Both are a `<button>` rather than a `<div>` with a `tabIndex`, which is what
 * `RadioGroup` next door uses. A radio is one stop in a group that roves, so
 * its tab index is computed and its element cannot be a button without
 * fighting the browser for the Space key. These have no group and no roving:
 * a button is focusable, disableable and Space-activated by the platform, and
 * every one of those is something this file then does not have to implement or
 * get wrong.
 *
 * Not `<input type="checkbox">`, for one reason that is not style. The
 * indeterminate state of a real checkbox is a DOM *property* with no
 * attribute, so it cannot be rendered on a server and has to be written by an
 * effect after mount -- and a control whose third state only exists in the
 * client is not a control this package can offer. `aria-checked="mixed"` is an
 * attribute and survives SSR.
 *
 * This package ships no CSS, so the box itself is the application's to draw.
 * `data-hozo-state` is how: it carries `checked`, `unchecked` or `mixed` on
 * every render, the way `TimePicker`'s arrows carry `data-hozo-step`, so one
 * class list can style all three without the application tracking state it
 * has already handed over.
 */

import { type ReactNode, useCallback, useState } from 'react'

/** Checked, not checked, or -- for a checkbox only -- partly. */
export type HozoCheckedState = boolean | 'mixed'

interface Shared {
  /**
   * The label, and the accessible name.
   *
   * Rendered inside the control, so the name is computed from it and a press
   * anywhere on it toggles -- which is what `<label for>` buys on the Web and
   * what React Native has no equivalent of. An application that wants the
   * label beside the box rather than in it can still lay it out that way;
   * this is about which element it is inside, not where it appears.
   */
  children?: ReactNode
  /**
   * Overrides the name `children` would compute.
   *
   * For the case the label is an icon, or is visible text that says less than
   * a reader needs. It does not add to `children`; it replaces it, because
   * `aria-label` is a replacement and pretending otherwise would put two
   * different names on one control depending on the platform.
   */
  accessibilityLabel?: string
  disabled?: boolean
  className?: string
}

export interface HozoCheckboxProps extends Shared {
  checked?: HozoCheckedState
  defaultChecked?: HozoCheckedState
  /**
   * Called with what the control became, which is never `mixed`.
   *
   * A person can press their way *out* of the mixed state and not into it:
   * mixed means something about a set of other things, and only the
   * application that owns that set can decide the control is in it. So the
   * handler's type is the honest one, and a caller that wants mixed back
   * passes it in `checked`.
   */
  onCheckedChange?: (checked: boolean) => void
}

export interface HozoSwitchProps extends Shared {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** What a press produces. Mixed resolves to checked, as the APG specifies. */
const toggled = (state: HozoCheckedState): boolean => state !== true

const attribute = (state: HozoCheckedState): string =>
  state === 'mixed' ? 'mixed' : state ? 'checked' : 'unchecked'

function useToggle(
  controlled: HozoCheckedState | undefined,
  initial: HozoCheckedState | undefined,
  notify: ((checked: boolean) => void) | undefined,
) {
  const [uncontrolled, setUncontrolled] = useState<HozoCheckedState>(initial ?? false)
  const state = controlled ?? uncontrolled
  const press = useCallback(() => {
    const next = toggled(state)
    if (controlled === undefined) setUncontrolled(next)
    notify?.(next)
  }, [controlled, notify, state])
  return { state, press }
}

export function HozoCheckbox({
  checked,
  defaultChecked,
  onCheckedChange,
  children,
  accessibilityLabel,
  disabled,
  className,
}: HozoCheckboxProps) {
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state}
      aria-label={accessibilityLabel}
      disabled={disabled}
      className={className}
      data-hozo-state={attribute(state)}
      onClick={press}
    >
      {children}
    </button>
  )
}

export function HozoSwitch({
  checked,
  defaultChecked,
  onCheckedChange,
  children,
  accessibilityLabel,
  disabled,
  className,
}: HozoSwitchProps) {
  const { state, press } = useToggle(checked, defaultChecked, onCheckedChange)
  return (
    <button
      type="button"
      role="switch"
      // Never `mixed`: the prop types forbid it and the role has no such
      // value, so there is nothing here to narrow.
      aria-checked={state === true}
      aria-label={accessibilityLabel}
      disabled={disabled}
      className={className}
      data-hozo-state={attribute(state)}
      onClick={press}
    >
      {children}
    </button>
  )
}

export {
  HozoCheckbox as Checkbox,
  type HozoCheckboxProps as CheckboxProps,
  type HozoCheckedState as CheckedState,
  HozoSwitch as Switch,
  type HozoSwitchProps as SwitchProps,
}
